#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {readFile, unlink} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {
  getListPosts,
  summarizeListPosts,
} from './adapters/x-api.mjs';
import {requireGpt56TextModel} from './adapters/openai-responses.mjs';
import {
  artDirectorReview,
  readArtDirection,
  readBaseProducts,
  readProducts,
} from './merch.mjs';
import {
  critiqueWeeklyGarment,
  directWeeklyGarment,
  evaluateVisualCritic,
  rankGarmentRecipes,
} from './services/weekly-art-director.mjs';
import {
  assertWeeklyProductRecipeIdentity,
  buildWeeklyCandidateProducts,
  renderWeeklyConceptBoard,
  upsertWeeklyProduct,
} from './services/weekly-product.mjs';
import {
  atomicWriteBuffer,
  atomicWriteJson,
  createWeeklyRunIdentity,
  hashJson,
  readWeeklyBinaryArtifact,
  readWeeklyArtifact,
  readWeeklyRun,
  recentTrendFingerprints,
  withWeeklyRunLock,
  writeWeeklyBinaryArtifact,
  writeWeeklyArtifact,
  writeWeeklyRun,
} from './services/weekly-run-store.mjs';
import {validateWeeklyPrepress} from './services/weekly-prepress.mjs';
import {
  deploymentProviderConfig,
  triggerProductionDeployment,
  waitForProductionDeployment,
} from './services/weekly-deployment.mjs';
import {
  analyzeWeeklyTrend,
  evaluateTrendCandidate,
  normalizeSignalPosts,
} from './services/weekly-trend.mjs';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productsPath = path.join(rootDir, 'merch/products.json');
const DEFAULT_LIST_ID = '2067819170989854863';
const REQUIRED_POST_COUNT = 30;
const PREPARATION_RECOVERY_ARTIFACT = 'preparation-recovery';
const PREPARATION_RECOVERY_VERSION = 1;
const PROVIDER_MOCKUP_PATTERN = /(?:^|-)printful-\d+\.(?:jpe?g|png|webp)$/i;
const WORKFLOW_STATUS_ORDER = [
  'draft',
  'generated',
  'mockups_ready',
  'approved',
  'published',
  'archived',
];
const PREPARE_TERMINAL_STATUSES = new Set([
  'prepared',
  'no_trend',
  'quarantined',
]);
const RELEASE_MANAGED_STATUSES = new Set([
  'releasing_candidate',
  'pushing_candidate',
  'waiting_candidate_deployment',
  'syncing_provider',
  'finalizing_publication',
  'pushing_final',
  'awaiting_final_deployment',
  'release_failed',
  'published',
]);
const RELEASABLE_STAGES = new Set([
  'prepared',
  'releasing_candidate',
  'pushing_candidate',
  'waiting_candidate_deployment',
  'syncing_provider',
  'finalizing_publication',
  'pushing_final',
  'awaiting_final_deployment',
]);

async function main() {
  loadLocalEnv();
  const [command = 'prepare', ...args] = process.argv.slice(2);
  if (command === 'prepare') return prepare(args);
  if (command === 'release') return release(args);
  if (command === 'status') return status(args);
  throw new Error(
    'Usage: node scripts/weekly-merch.mjs <prepare|release|status> [options]',
  );
}

export async function prepare(args = []) {
  const options = parsePrepareOptions(args);
  const identity = createWeeklyRunIdentity({
    listId: options.listId,
    week: options.week,
  });

  return withWeeklyRunLock(identity, async () => {
    const existing = await readWeeklyRun(identity);
    if (existing?.status === 'published') {
      printRunSummary(existing, {idempotentReplay: true});
      return existing;
    }
    if (existing && RELEASE_MANAGED_STATUSES.has(existing.status)) {
      throw new Error(
        `Run ${identity.runId} is controlled by the release state machine (${existing.status}); use status or release instead of prepare`,
      );
    }
    if (
      existing &&
      PREPARE_TERMINAL_STATUSES.has(existing.status) &&
      (!options.force || options.dryRun)
    ) {
      await completePreparationRecovery(identity, `${existing.status}-replay`);
      printRunSummary(existing, {idempotentReplay: true});
      return existing;
    }

    await recoverPreparationRecovery(identity);

    const requestedInputMode = options.fixture ? 'fixture' : 'live-x';
    assertReplayInputMode(existing, requestedInputMode);

    let preparationGit = null;
    if (!options.dryRun) {
      await assertPrepareWorktree(options);
      preparationGit = {
        branch: await currentBranch(),
        baseCommit: await currentHead(),
      };
      if (!preparationGit.branch) {
        throw new Error('Weekly preparation requires a named Git branch');
      }
    }
    const definitionHashes = await weeklyDefinitionHashes();
    const startedAt = existing?.startedAt || new Date().toISOString();
    let run = await writeWeeklyRun(identity, {
      ...(existing || {}),
      identity,
      status: 'collecting_signals',
      startedAt,
      requestedPostCount: options.count,
      inputMode: requestedInputMode,
      offlineModels: options.offline,
      dryRun: options.dryRun,
      model: requireGpt56TextModel(process.env.OPENAI_TEXT_MODEL),
      preparedBranch: existing?.preparedBranch || preparationGit?.branch || null,
      preparedBaseCommit:
        existing?.preparedBaseCommit || preparationGit?.baseCommit || null,
      definitionHashes,
      error: null,
    });
    let catalogMutated = false;
    let recoveryArmed = false;
    let candidateAssetPaths = new Set();

    try {
      const posts = await loadSignalPosts(options, identity, existing);
      if (posts.length !== REQUIRED_POST_COUNT) {
        throw new Error(
          `Weekly preparation requires exactly ${REQUIRED_POST_COUNT} normalized posts; received ${posts.length}`,
        );
      }
      const signalInput = signalHashInput(posts);
      const inputHash = hashJson(signalInput);
      if (existing?.inputHash && existing.inputHash !== inputHash) {
        throw new Error(
          'Frozen weekly input changed for an existing run. Start a different ISO-week run instead.',
        );
      }
      await writeWeeklyArtifact(identity, 'signal-snapshot', {
        private: true,
        retention: 'local ignored run artifact; do not publish',
        inputMode: requestedInputMode,
        listId: identity.listId,
        count: posts.length,
        inputHash,
        posts,
      });
      run = await writeWeeklyRun(identity, {
        ...run,
        status: 'analyzing_trend',
        inputHash,
        signalCount: posts.length,
      });

      const modelFixture = options.offline
        ? await readJson(options.modelFixture)
        : null;
      requireOfflineFixtureStage(modelFixture, 'trend', options);
      const trendResult = await analyzeWeeklyTrend({
        posts,
        listId: identity.listId,
        runKey: identity.runKey,
        modelOutput: modelFixture?.trend,
      });
      const pastFingerprints = await recentTrendFingerprints({
        excludeRunId: identity.runId,
      });
      const trendDecision = evaluateTrendCandidate(trendResult.output, posts, {
        pastFingerprints,
      });
      await writeWeeklyArtifact(identity, 'trend-model-output', {
        output: trendResult.output,
        response: trendResult.response,
        outputHash: hashJson(trendResult.output),
      });
      await writeWeeklyArtifact(identity, 'trend-decision', trendDecision);

      if (!trendDecision.publishEligible) {
        run = await writeWeeklyRun(identity, {
          ...run,
          status: 'no_trend',
          trend: {
            name: trendResult.output.trendName,
            score: trendDecision.score,
            reason: trendDecision.reason,
          },
          completedAt: new Date().toISOString(),
        });
        printRunSummary(run);
        return run;
      }

      const [products, bases, artDirection] = await Promise.all([
        readProducts(),
        readBaseProducts(),
        readArtDirection(),
      ]);
      const baseProduct = bases.products.find(
        (base) => base.alias === 'printful-aop-cotton-sweatshirt-white',
      );
      if (!baseProduct) throw new Error('Missing weekly AOP cotton base product');
      requireOfflineFixtureStage(modelFixture, 'artDirection', options);
      const artResult = await directWeeklyGarment({
        trend: trendResult.output,
        decision: trendDecision,
        baseProduct,
        artDirection,
        recentProductTitles: products.map((product) => product.title),
        recentProducts: products,
        requiredDisplayPhrase: trendResult.output.trendName,
        inputMode: 'weekly-derived-trend',
        runKey: identity.runKey,
        modelOutput: modelFixture?.artDirection,
      });
      const rankedRecipes = rankGarmentRecipes(artResult.output, {
        sourceTexts: posts.map((post) => post.text),
        requiredDisplayPhrase: trendResult.output.trendName,
      });
      if (!rankedRecipes.some((entry) => entry.eligible)) {
        throw new Error('No garment recipe passed deterministic rights and production gates');
      }
      await writeWeeklyArtifact(identity, 'garment-recipes', {
        output: artResult.output,
        response: artResult.response,
        ranked: rankedRecipes.map((entry) => ({
          conceptId: entry.candidate.conceptId,
          eligible: entry.eligible,
          weightedScore: entry.weightedScore,
          checks: entry.checks,
        })),
        outputHash: hashJson(artResult.output),
      });

      if (options.dryRun) {
        run = await writeWeeklyRun(identity, {
          ...run,
          status: 'planned',
          trend: publicTrendSummary(trendResult.output, trendDecision),
          recipeCandidates: rankedRecipes.map((entry) => ({
            conceptId: entry.candidate.conceptId,
            title: entry.candidate.title,
            eligible: entry.eligible,
            score: entry.weightedScore,
          })),
          completedAt: new Date().toISOString(),
        });
        printRunSummary(run);
        return run;
      }

      run = {...run, inputHash, identity};
      const eligibleRecipes = rankedRecipes.filter((entry) => entry.eligible).slice(0, 2);
      const attemptProducts = buildWeeklyCandidateProducts({
        existingProducts: products,
        baseProduct,
        trend: trendResult.output,
        trendDecision,
        recipes: eligibleRecipes.map((entry) => entry.candidate),
        posts,
        run,
      });
      candidateAssetPaths = new Set(candidateRecoveryAssetPaths(attemptProducts));
      await armPreparationRecovery(identity, {
        assetPaths: [...candidateAssetPaths],
      });
      recoveryArmed = true;

      const criticAttempts = [];
      let selected = null;
      for (const [attempt, ranked] of eligibleRecipes.entries()) {
        let product = structuredClone(attemptProducts[attempt]);
        const upsert = upsertWeeklyProduct(products, product);
        await atomicWriteJson(productsPath, upsert.products);
        catalogMutated = true;
        await renderWeeklyConceptBoard(
          product,
          path.join(rootDir, product.assets.artwork),
        );
        const structuralReview = artDirectorReview(product, baseProduct, artDirection);
        const attemptIdentity = weeklyAttemptIdentity(attempt, product, ranked.candidate);
        if (!structuralReview.accepted) {
          criticAttempts.push({
            ...attemptIdentity,
            structuralReview,
            gate: {passed: false, decision: 'revise'},
          });
          await restorePreparationRecoveryAssets(
            identity,
            candidateRecoveryAssetPaths([product]),
            {reason: `structural-rejection:${ranked.candidate.conceptId}`},
          );
          continue;
        }
        await runMerchCommand(['compose-print-files', '--slug', product.slug]);
        const current = findProductByRun(await readProducts(), identity.runKey);
        if (!current) throw new Error('Compositor lost the weekly product');
        product = current;
        assertWeeklyProductRecipeIdentity(product, ranked.candidate);
        const unjournaledAssets = productAssetPaths(product).filter(
          (file) => !candidateAssetPaths.has(file),
        );
        if (unjournaledAssets.length) {
          throw new Error(
            `Compositor produced assets outside the recovery journal: ${unjournaledAssets.join(', ')}`,
          );
        }
        const prepress = await validateWeeklyPrepress({
          product,
          baseProduct,
          rootDir,
        });
        if (!prepress.ok) {
          criticAttempts.push({
            ...attemptIdentity,
            structuralReview,
            prepress,
            gate: {passed: false, decision: 'revise'},
          });
          await restorePreparationRecoveryAssets(
            identity,
            candidateRecoveryAssetPaths([product]),
            {reason: `prepress-rejection:${ranked.candidate.conceptId}`},
          );
          continue;
        }
        const imagePaths = criticImagePaths(product);
        requireOfflineFixtureStage(modelFixture, 'visualCritic', options);
        const criticResult = await critiqueWeeklyGarment({
          product,
          recipe: ranked.candidate,
          imagePaths,
          prepress,
          runKey: identity.runKey,
          modelOutput: modelFixture?.visualCritic,
        });
        const gate = evaluateVisualCritic(criticResult.output);
        criticAttempts.push({
          ...attemptIdentity,
          structuralReview,
          prepress,
          output: criticResult.output,
          response: criticResult.response,
          gate,
        });
        if (gate.passed) {
          selected = {ranked, criticResult, gate, productSlug: product.slug};
          break;
        }
        await restorePreparationRecoveryAssets(
          identity,
          candidateRecoveryAssetPaths([product]),
          {reason: `visual-rejection:${ranked.candidate.conceptId}`},
        );
      }
      await writeWeeklyArtifact(identity, 'visual-critic', {
        attempts: criticAttempts,
        selected: selected
          ? {
              conceptId: selected.ranked.candidate.conceptId,
              title: selected.ranked.candidate.title,
              productSlug: selected.productSlug,
            }
          : null,
        outputHash: hashJson(criticAttempts),
      });

      if (!selected) {
        await recoverPreparationRecovery(identity, {
          outcome: 'quarantined',
        });
        catalogMutated = false;
        recoveryArmed = false;
        run = await writeWeeklyRun(identity, {
          ...run,
          status: 'quarantined',
          trend: publicTrendSummary(trendResult.output, trendDecision),
          error: 'No candidate passed the actual-render visual critic within two attempts.',
          completedAt: new Date().toISOString(),
        });
        printRunSummary(run);
        return run;
      }

      const currentProducts = await readProducts();
      const product = findProductByRun(currentProducts, identity.runKey);
      if (!product || product.slug !== selected.productSlug) {
        throw new Error('Selected weekly candidate was not persisted under its approved identity');
      }
      assertWeeklyProductRecipeIdentity(product, selected.ranked.candidate);
      product.artDirector.review = {
        reviewer: 'responses-actual-render-critic',
        checkedAt: new Date().toISOString(),
        responseId: selected.criticResult.response.responseId,
        decision: selected.criticResult.output.decision,
        overallScore: selected.criticResult.output.overallScore,
        scores: selected.criticResult.output.scores,
        criticalDefects: selected.criticResult.output.criticalDefects,
      };
      product.automation.selectedConceptId = selected.ranked.candidate.conceptId;
      product.automation.criticScore = selected.criticResult.output.overallScore;
      replaceProductByRun(currentProducts, product);
      await atomicWriteJson(productsPath, currentProducts);
      await runReleaseVerification();

      const assetHashes = await hashProductAssets(product);
      const changedFiles = ['merch/products.json', ...Object.keys(assetHashes)].sort();
      if (!options.devAllowDirty) await assertOnlyExpectedChanges(changedFiles);
      const preparedProductHash = hashJson(product);
      const preparedDesignHash = hashJson(immutableProductProjection(product));
      const releasePlan = buildReleasePlan(
        run,
        product,
        assetHashes,
        preparedProductHash,
        preparedDesignHash,
      );
      await writeWeeklyArtifact(identity, 'release-plan', releasePlan);
      run = await writeWeeklyRun(identity, {
        ...run,
        status: 'prepared',
        productSlug: product.slug,
        selectedConceptId: selected.ranked.candidate.conceptId,
        trend: publicTrendSummary(trendResult.output, trendDecision),
        critic: {
          score: selected.criticResult.output.overallScore,
          decision: selected.criticResult.output.decision,
        },
        assetHashes,
        changedFiles,
        preparedProductHash,
        preparedDesignHash,
        releasePlanHash: hashJson(releasePlan),
        completedAt: new Date().toISOString(),
      });
      await completePreparationRecovery(identity, 'prepared');
      catalogMutated = false;
      recoveryArmed = false;
      printRunSummary(run);
      return run;
    } catch (error) {
      if (catalogMutated || recoveryArmed) {
        await recoverPreparationRecovery(identity, {
          outcome: 'failed',
        });
      }
      run = await writeWeeklyRun(identity, {
        ...run,
        status: 'failed',
        error: String(error?.message || error),
        failedAt: new Date().toISOString(),
      });
      throw error;
    }
  });
}

export async function release(args = []) {
  const options = parseReleaseOptions(args);
  const run = await loadRunByOptions(options);
  const identity = run.identity;

  return withWeeklyRunLock(identity, async () => {
    const currentRun = await readWeeklyRun(identity);
    let product = findProductByRun(await readProducts(), identity.runKey);
    if (!product) throw new Error('Prepared weekly product is missing from the catalog');
    const plan = await readWeeklyArtifact(identity, 'release-plan');
    if (!plan || hashJson(plan) !== currentRun.releasePlanHash) {
      throw new Error('Release plan hash does not match the prepared run');
    }
    const liveProvenance = liveReleaseProvenance(currentRun);
    const publicPlan = {
      runId: identity.runId,
      runKey: identity.runKey,
      status: currentRun.status,
      resumeStage: releaseStage(currentRun),
      productSlug: product.slug,
      releaseAuthorized: options.release,
      killSwitchEnabled: process.env.MERCH_WEEKLY_RELEASE_ENABLED === 'true',
      liveProvenance,
      steps: plan.steps,
      changedFiles: currentRun.changedFiles,
      assetHashes: currentRun.assetHashes,
      deploymentProvider: process.env.MERCH_DEPLOY_PROVIDER || null,
    };
    if (!options.release) {
      printJson(publicPlan);
      return publicPlan;
    }
    if (currentRun.status === 'published') {
      printRunSummary(currentRun, {idempotentReplay: true});
      return currentRun;
    }

    requireReleaseEnvironment();
    if (!liveProvenance.releasable) {
      throw new Error(
        'Release requires a non-fixture, non-offline preparation collected from live X',
      );
    }
    await assertLiveDecisionProvenance(identity, currentRun);
    let stage = releaseStage(currentRun);
    if (!RELEASABLE_STAGES.has(stage)) {
      throw new Error(`Run status ${currentRun.status} is not releasable`);
    }
    const branch = await currentBranch();
    if (!branch || ['main', 'master'].includes(branch)) {
      throw new Error('Weekly release must run from a dedicated non-default branch');
    }
    const expectedBranch = currentRun.branch || currentRun.preparedBranch;
    if (!currentRun.preparedBaseCommit || !expectedBranch) {
      throw new Error('Prepared run is missing its Git branch/base checkpoint');
    }
    if (branch !== expectedBranch) {
      throw new Error(
        `Weekly release belongs to branch ${expectedBranch}; current branch is ${branch}`,
      );
    }

    let nextRun = currentRun;
    try {
      if (stage === 'prepared' || stage === 'releasing_candidate') {
        await verifyPreparationCheckpoint(currentRun);
        await assertOnlyExpectedChanges(currentRun.changedFiles);
        await runReleaseVerification();
        nextRun = await writeWeeklyRun(identity, {
          ...nextRun,
          status: 'releasing_candidate',
          branch,
          error: null,
          resumeFrom: null,
        });
        const candidateCommit = await commitFiles(
          currentRun.changedFiles,
          `Build weekly candidate ${identity.isoWeek}`,
        );
        nextRun = await writeWeeklyRun(identity, {
          ...nextRun,
          candidateCommit,
          status: 'pushing_candidate',
        });
        stage = 'pushing_candidate';
      }

      if (stage === 'pushing_candidate') {
        await verifyCandidateCheckpoint(nextRun, {requireExactProduct: true});
        await pushBranch(branch);
        const candidateDeployment = await triggerProductionDeployment({
          phase: 'candidate',
          commit: nextRun.candidateCommit,
          branch,
          runId: identity.runId,
          existing: nextRun.candidateDeployment,
        });
        nextRun = await writeWeeklyRun(identity, {
          ...nextRun,
          candidateDeployment,
          status: 'waiting_candidate_deployment',
        });
        stage = 'waiting_candidate_deployment';
      }

      if (stage === 'waiting_candidate_deployment') {
        await verifyCandidateCheckpoint(nextRun, {requireExactProduct: true});
        const candidateCheckpoint =
          nextRun.candidateDeployment ||
          (await triggerProductionDeployment({
            phase: 'candidate',
            commit: nextRun.candidateCommit,
            branch,
            runId: identity.runId,
          }));
        if (!nextRun.candidateDeployment) {
          nextRun = await writeWeeklyRun(identity, {
            ...nextRun,
            candidateDeployment: candidateCheckpoint,
          });
        }
        const candidateDeployment =
          await waitForProductionDeployment(candidateCheckpoint);
        nextRun = await writeWeeklyRun(identity, {
          ...nextRun,
          candidateDeployment,
        });
        await waitForPublicAssets(
          process.env.PUBLIC_SITE_URL,
          nextRun.assetHashes,
        );
        nextRun = await writeWeeklyRun(identity, {
          ...nextRun,
          status: 'syncing_provider',
        });
        stage = 'syncing_provider';
      }

      if (stage === 'syncing_provider') {
        await verifyCandidateCheckpoint(nextRun, {requireExactProduct: false});
        product = findProductByRun(await readProducts(), identity.runKey);
        await assertOnlyExpectedReleaseChanges(currentRun, product);
        await runVerifiedProviderMutation({
          siteUrl: process.env.PUBLIC_SITE_URL,
          assetHashes: nextRun.assetHashes,
          mutate: () =>
            runMerchCommand([
              'printful:upsert',
              '--slug',
              product.slug,
              '--site-url',
              process.env.PUBLIC_SITE_URL,
            ]),
        });
        product = findProductByRun(await readProducts(), identity.runKey);
        if (!providerMockupsReady(product)) {
          const printful = product.providerRefs.printful || {};
          if (!printful.mockupTaskKey) {
            if (Number(printful.mockupTaskFailures || 0) >= 2) {
              throw new Error(
                'Printful mockup generation failed twice; operator review is required before another task',
              );
            }
            await runMerchCommand([
              'mockups',
              '--slug',
              product.slug,
              '--site-url',
              process.env.PUBLIC_SITE_URL,
            ]);
          }
          product = findProductByRun(await readProducts(), identity.runKey);
          if (!providerMockupsReady(product)) {
            await pollPrintfulMockups(product.slug);
          }
        }
        await runMerchCommand(['photoshoot', '--slug', product.slug]);

        const providerProduct = findProductByRun(
          await readProducts(),
          identity.runKey,
        );
        const bases = await readBaseProducts();
        const providerBase = bases.products.find(
          (base) => base.alias === providerProduct.production.baseProduct,
        );
        const finalPrepress = await validateWeeklyPrepress({
          product: providerProduct,
          baseProduct: providerBase,
          rootDir,
        });
        if (!finalPrepress.ok) {
          throw new Error(`Final prepress failed: ${finalPrepress.issues.join('; ')}`);
        }
        const finalCritic = await critiqueWeeklyGarment({
          product: providerProduct,
          recipe: recipeFromProduct(providerProduct),
          imagePaths: criticImagePaths(providerProduct, {preferCustomer: true}),
          prepress: finalPrepress,
          runKey: identity.runKey,
        });
        const finalGate = evaluateVisualCritic(finalCritic.output);
        const finalCriticArtifact = {
          output: finalCritic.output,
          response: finalCritic.response,
          gate: finalGate,
          prepress: finalPrepress,
        };
        await writeWeeklyArtifact(identity, 'final-visual-critic', finalCriticArtifact);
        if (!finalGate.passed) {
          throw new Error('Final provider/customer render did not pass the visual critic');
        }
        assertGpt56ResponseMetadata(finalCritic.response, 'final visual critic');

        await runMerchCommand(['printful:verify', '--slug', product.slug]);
        const postCriticCheckpoint = buildPostCriticCheckpoint({
          product: providerProduct,
          assetHashes: await hashProductAssets(providerProduct),
          criticArtifact: finalCriticArtifact,
        });
        nextRun = await writeWeeklyRun(identity, {
          ...nextRun,
          ...postCriticCheckpoint,
          status: 'finalizing_publication',
          finalCriticResponseId: finalCritic.response.responseId,
          finalCriticModel: finalCritic.response.model,
        });
        stage = 'finalizing_publication';
      }

      if (stage === 'finalizing_publication') {
        product = findProductByRun(await readProducts(), identity.runKey);
        const head = await currentHead();
        if (head === nextRun.candidateCommit) {
          await verifyCandidateCheckpoint(nextRun, {requireExactProduct: false});
          await verifyPostCriticCheckpoint(nextRun, product);
          await runMerchCommand(['printful:verify', '--slug', product.slug]);
          if (product.workflow.status !== 'published') {
            await runMerchCommand([
              'publish',
              '--slug',
              product.slug,
              '--approve',
              '--by',
              'codex-weekly-automation',
            ]);
          }
          await runReleaseVerification();
          product = findProductByRun(await readProducts(), identity.runKey);
          if (product?.workflow?.status !== 'published') {
            throw new Error('Catalog publication did not produce published status');
          }

          const finalHashes = await verifyPostCriticCheckpoint(nextRun, product);
          const finalFiles = ['merch/products.json', ...Object.keys(finalHashes)].sort();
          await assertOnlyExpectedReleaseChanges(currentRun, product);
          const finalCommit = await commitFiles(
            finalFiles,
            `Publish weekly garment ${identity.isoWeek}`,
          );
          nextRun = await writeWeeklyRun(identity, {
            ...nextRun,
            status: 'pushing_final',
            providerProductId: product.providerRefs.printful.productId,
            finalCommit,
            finalHashes,
            finalFiles,
            finalProductHash: hashJson(product),
          });
        } else {
          const recovered = await recoverFinalCommitCheckpoint(nextRun, product, head);
          nextRun = await writeWeeklyRun(identity, {
            ...nextRun,
            ...recovered,
            status: 'pushing_final',
          });
        }
        stage = 'pushing_final';
      }

      if (stage === 'pushing_final') {
        product = findProductByRun(await readProducts(), identity.runKey);
        await verifyFinalState(nextRun, product);
        await runReleaseVerification();
        await pushBranch(branch);
        const finalDeployment = await triggerProductionDeployment({
          phase: 'final',
          commit: nextRun.finalCommit,
          branch,
          runId: identity.runId,
          existing: nextRun.finalDeployment,
        });
        nextRun = await writeWeeklyRun(identity, {
          ...nextRun,
          finalDeployment,
          status: 'awaiting_final_deployment',
        });
        stage = 'awaiting_final_deployment';
      }

      if (stage === 'awaiting_final_deployment') {
        product = findProductByRun(await readProducts(), identity.runKey);
        await verifyFinalState(nextRun, product);
        const finalCheckpoint =
          nextRun.finalDeployment ||
          (await triggerProductionDeployment({
            phase: 'final',
            commit: nextRun.finalCommit,
            branch,
            runId: identity.runId,
          }));
        if (!nextRun.finalDeployment) {
          nextRun = await writeWeeklyRun(identity, {
            ...nextRun,
            finalDeployment: finalCheckpoint,
          });
        }
        const finalDeployment = await waitForProductionDeployment(finalCheckpoint);
        nextRun = await writeWeeklyRun(identity, {
          ...nextRun,
          finalDeployment,
        });
        await waitForPublicAssets(process.env.PUBLIC_SITE_URL, nextRun.finalHashes);
        await waitForPublicProduct(process.env.PUBLIC_SITE_URL, product);
        nextRun = await writeWeeklyRun(identity, {
          ...nextRun,
          status: 'published',
          resumeFrom: null,
          publicUrl: `${trimSlash(process.env.PUBLIC_SITE_URL)}/products/${product.commerce.handle}`,
          publishedAt: new Date().toISOString(),
        });
        printRunSummary(nextRun);
        return nextRun;
      }

      throw new Error(`Release state machine stopped at unexpected stage ${stage}`);
    } catch (error) {
      nextRun = await writeWeeklyRun(identity, {
        ...nextRun,
        status: 'release_failed',
        resumeFrom: releaseStage(nextRun),
        error: String(error?.message || error),
        failedAt: new Date().toISOString(),
      });
      throw error;
    }
  });
}

export async function status(args = []) {
  const run = await loadRunByOptions(parseReleaseOptions(args));
  printRunSummary(run);
  return run;
}

async function loadSignalPosts(options, identity, existing) {
  if (existing?.inputHash && !options.refreshInput) {
    const snapshot = await readWeeklyArtifact(identity, 'signal-snapshot');
    if (snapshot?.posts?.length) {
      const snapshotMode = snapshot.inputMode || existing.inputMode;
      const requestedMode = options.fixture ? 'fixture' : 'live-x';
      if (snapshotMode !== requestedMode) {
        throw new Error(
          `Frozen weekly input is ${snapshotMode}; refusing to replay it as ${requestedMode}`,
        );
      }
      return normalizeSignalPosts(snapshot.posts);
    }
  }
  if (options.fixture) {
    const fixture = await readJson(options.fixture);
    return normalizeSignalPosts(fixture.posts || fixture.data || fixture);
  }
  const result = await getListPosts({
    listId: options.listId,
    maxResults: options.count,
  });
  return normalizeSignalPosts(summarizeListPosts(result, options.listId));
}

function parsePrepareOptions(args) {
  validateCliArgs(args, {
    valueFlags: [
      '--count',
      '--list-id',
      '--week',
      '--fixture',
      '--model-fixture',
    ],
    booleanFlags: [
      '--offline',
      '--dry-run',
      '--refresh-input',
      '--force',
      '--dev-allow-dirty',
    ],
  });
  const count = Number(readArg(args, '--count', REQUIRED_POST_COUNT));
  if (count !== REQUIRED_POST_COUNT) {
    throw new Error(`--count must be exactly ${REQUIRED_POST_COUNT}`);
  }
  const fixture = readArg(args, '--fixture');
  const offline = hasFlag(args, '--offline');
  const devAllowDirty = hasFlag(args, '--dev-allow-dirty');
  if (offline && !fixture) throw new Error('--offline requires --fixture');
  if (devAllowDirty && !(offline && fixture)) {
    throw new Error('--dev-allow-dirty is restricted to offline fixture development');
  }
  return {
    listId: readArg(args, '--list-id', process.env.X_LIST_ID || DEFAULT_LIST_ID),
    count,
    week: readArg(args, '--week'),
    fixture: fixture ? path.resolve(rootDir, fixture) : null,
    modelFixture: path.resolve(
      rootDir,
      readArg(
        args,
        '--model-fixture',
        'fixtures/openai/weekly-happy-path.synthetic.json',
      ),
    ),
    offline,
    dryRun: hasFlag(args, '--dry-run'),
    refreshInput: hasFlag(args, '--refresh-input'),
    force: hasFlag(args, '--force'),
    devAllowDirty,
  };
}

function parseReleaseOptions(args) {
  validateCliArgs(args, {
    valueFlags: ['--run-id', '--list-id', '--week'],
    booleanFlags: ['--release'],
  });
  return {
    runId: readArg(args, '--run-id'),
    listId: readArg(args, '--list-id', process.env.X_LIST_ID || DEFAULT_LIST_ID),
    week: readArg(args, '--week'),
    release: hasFlag(args, '--release'),
  };
}

function validateCliArgs(args, {valueFlags, booleanFlags}) {
  const values = new Set(valueFlags);
  const booleans = new Set(booleanFlags);
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!values.has(token) && !booleans.has(token)) {
      throw new Error(`Unknown weekly option: ${token}`);
    }
    if (seen.has(token)) throw new Error(`Duplicate weekly option: ${token}`);
    seen.add(token);
    if (values.has(token)) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for weekly option: ${token}`);
      }
      index += 1;
    }
  }
}

function requireOfflineFixtureStage(fixture, stage, options) {
  if (options.offline && !fixture?.[stage]) {
    throw new Error(
      `Offline model fixture is missing the required ${stage} output; refusing to call a live model`,
    );
  }
}

async function loadRunByOptions(options) {
  const identity = options.runId
    ? {runId: validateRunId(options.runId)}
    : createWeeklyRunIdentity({listId: options.listId, week: options.week});
  const run = await readWeeklyRun(identity);
  if (!run) throw new Error(`Unknown weekly run: ${identity.runId}`);
  return run;
}

function buildReleasePlan(
  run,
  product,
  assetHashes,
  preparedProductHash,
  preparedDesignHash,
) {
  return {
    runId: run.identity.runId,
    runKey: run.identity.runKey,
    productSlug: product.slug,
    inputHash: run.inputHash,
    definitionHashes: run.definitionHashes,
    assetHashes,
    preparedProductHash,
    preparedDesignHash,
    preparedBranch: run.preparedBranch,
    preparedBaseCommit: run.preparedBaseCommit,
    providerExternalId: product.slug,
    orderCreationAllowed: false,
    steps: [
      'Commit and push candidate assets on a dedicated branch.',
      'Trigger the configured production deployment and verify every public asset byte hash.',
      'Upsert one Printful product by stable external ID and poll provider mockups.',
      'Generate the customer photoshoot and rerun the visual/provider gates.',
      'Set catalog status to published only after all gates pass.',
      'Commit, push, and explicitly deploy the final catalog, then verify the public product and checkout readiness.',
    ],
  };
}

async function assertPrepareWorktree(options) {
  const changes = await gitStatusPaths();
  if (changes.length && !options.devAllowDirty) {
    throw new Error(
      `Weekly preparation requires a clean dedicated checkout; found ${changes.length} changed paths`,
    );
  }
}

async function assertOnlyExpectedChanges(expected) {
  const expectedSet = new Set(expected);
  const changes = await gitStatusPaths();
  const unrelated = changes.filter((file) => !expectedSet.has(file));
  if (unrelated.length) {
    throw new Error(`Unexpected worktree changes: ${unrelated.join(', ')}`);
  }
}

async function gitStatusPaths() {
  const {stdout} = await execFileAsync('git', ['status', '--porcelain=v1', '-z'], {
    cwd: rootDir,
    maxBuffer: 2_000_000,
  });
  const tokens = stdout.split('\0').filter(Boolean);
  const paths = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const statusCode = token.slice(0, 2);
    const file = token.slice(3);
    paths.push(file);
    if (statusCode.includes('R') || statusCode.includes('C')) index += 1;
  }
  return paths.sort();
}

async function hashProductAssets(product) {
  const files = [
    product.assets.artwork,
    ...(product.assets.printFiles || []).map((asset) => asset.path),
    ...(product.assets.mockups || []),
    ...(product.assets.customerPhotos || []),
  ];
  const result = {};
  for (const file of [...new Set(files.filter(Boolean))]) {
    const absolute = path.resolve(rootDir, file);
    if (!absolute.startsWith(`${rootDir}${path.sep}`) || !existsSync(absolute)) {
      throw new Error(`Missing or unsafe generated asset: ${file}`);
    }
    result[file] = createHash('sha256').update(await readFile(absolute)).digest('hex');
  }
  return result;
}

async function verifyPreparedHashes(run) {
  const product = findProductByRun(await readProducts(), run.identity.runKey);
  if (!product) throw new Error('Prepared product is missing');
  if (!run.preparedProductHash || hashJson(product) !== run.preparedProductHash) {
    throw new Error('Prepared product data changed after quality approval');
  }
  const current = await hashProductAssets(product);
  if (hashJson(current) !== hashJson(run.assetHashes)) {
    throw new Error('Prepared asset hashes changed after quality approval');
  }
  if (hashJson(await weeklyDefinitionHashes()) !== hashJson(run.definitionHashes)) {
    throw new Error('Prompt or schema definitions changed after preparation');
  }
  if (
    !run.preparedDesignHash ||
    hashJson(immutableProductProjection(product)) !== run.preparedDesignHash
  ) {
    throw new Error('Prepared garment design changed after quality approval');
  }
}

async function verifyPreparationCheckpoint(run) {
  await verifyPreparedHashes(run);
  const head = await currentHead();
  if (head === run.preparedBaseCommit) return;
  await assertCandidateCommitShape(run, head);
}

async function verifyCandidateCheckpoint(run, {requireExactProduct}) {
  if (!run.candidateCommit) throw new Error('Candidate commit checkpoint is missing');
  if ((await currentHead()) !== run.candidateCommit) {
    throw new Error('Current Git revision does not match the candidate commit');
  }
  await assertCandidateCommitShape(run, run.candidateCommit);
  const product = findProductByRun(await readProducts(), run.identity.runKey);
  if (!product) throw new Error('Candidate product is missing');
  if (
    !run.preparedDesignHash ||
    hashJson(immutableProductProjection(product)) !== run.preparedDesignHash
  ) {
    throw new Error('Candidate garment design changed after quality approval');
  }
  if (requireExactProduct && hashJson(product) !== run.preparedProductHash) {
    throw new Error('Candidate product changed before provider synchronization');
  }
  await verifyPreparedAssetSubset(run);
  if (hashJson(await weeklyDefinitionHashes()) !== hashJson(run.definitionHashes)) {
    throw new Error('Prompt or schema definitions changed after preparation');
  }
}

async function verifyPreparedAssetSubset(run) {
  for (const [file, expectedHash] of Object.entries(run.assetHashes || {})) {
    const absolute = path.resolve(rootDir, file);
    if (!absolute.startsWith(`${rootDir}${path.sep}`) || !existsSync(absolute)) {
      throw new Error(`Prepared asset is missing or unsafe: ${file}`);
    }
    const actualHash = createHash('sha256').update(await readFile(absolute)).digest('hex');
    if (actualHash !== expectedHash) {
      throw new Error(`Prepared asset changed after quality approval: ${file}`);
    }
  }
}

async function assertCandidateCommitShape(run, commit) {
  await assertSingleCommitBetween(run.preparedBaseCommit, commit, 'candidate');
  const paths = await gitChangedPathsBetween(run.preparedBaseCommit, commit);
  if (hashJson(paths) !== hashJson([...(run.changedFiles || [])].sort())) {
    throw new Error('Candidate commit contains files outside the approved preparation set');
  }
}

async function recoverFinalCommitCheckpoint(run, product, head) {
  if (product?.workflow?.status !== 'published') {
    throw new Error('Unrecorded post-candidate commit is not a published product checkpoint');
  }
  const reviewedAssetHashes = await verifyPostCriticCheckpoint(run, product);
  if (hashJson(immutableProductProjection(product)) !== run.preparedDesignHash) {
    throw new Error('Recovered final commit changed the approved garment design');
  }
  await verifyPreparedAssetSubset(run);
  await assertSingleCommitBetween(run.candidateCommit, head, 'final publication');
  if ((await gitStatusPaths()).length) {
    throw new Error('Cannot recover a final commit with additional worktree changes');
  }
  const finalHashes = reviewedAssetHashes;
  const finalFiles = ['merch/products.json', ...Object.keys(finalHashes)].sort();
  const changed = await gitChangedPathsBetween(run.candidateCommit, head);
  const allowed = new Set(finalFiles);
  if (
    !changed.includes('merch/products.json') ||
    changed.some((file) => !allowed.has(file))
  ) {
    throw new Error('Recovered final commit contains files outside the publication set');
  }
  return {
    providerProductId: product.providerRefs.printful?.productId || null,
    finalCommit: head,
    finalHashes,
    finalFiles,
    finalProductHash: hashJson(product),
  };
}

async function assertSingleCommitBetween(base, head, label) {
  if (!base || !head) throw new Error(`${label} Git checkpoint is incomplete`);
  const {stdout} = await execFileAsync(
    'git',
    ['rev-list', '--count', `${base}..${head}`],
    {cwd: rootDir},
  );
  if (Number(stdout.trim()) !== 1) {
    throw new Error(`${label} checkpoint must be exactly one commit after its base`);
  }
  await execFileAsync('git', ['merge-base', '--is-ancestor', base, head], {
    cwd: rootDir,
  });
}

async function gitChangedPathsBetween(base, head) {
  const {stdout} = await execFileAsync(
    'git',
    ['diff', '--name-only', '-z', base, head],
    {cwd: rootDir, maxBuffer: 2_000_000},
  );
  return stdout.split('\0').filter(Boolean).sort();
}

async function verifyFinalState(run, product) {
  if (!['pushing_final', 'awaiting_final_deployment'].includes(releaseStage(run))) {
    throw new Error(`Final deployment verification cannot start from ${run.status}`);
  }
  if (product?.workflow?.status !== 'published') {
    throw new Error('Final deployment verification requires a published local product');
  }
  if (!run.finalProductHash || hashJson(product) !== run.finalProductHash) {
    throw new Error('Final product data changed after the publication commit');
  }
  const currentHashes = await hashProductAssets(product);
  if (hashJson(currentHashes) !== hashJson(run.finalHashes)) {
    throw new Error('Final product assets changed after the publication commit');
  }
  if (!run.finalCommit || (await currentHead()) !== run.finalCommit) {
    throw new Error('Current Git revision does not match the final publication commit');
  }
}

export function immutableProductProjection(product) {
  if (!product || typeof product !== 'object') return product;
  const design = structuredClone(product);
  delete design.workflow;
  delete design.providerRefs;
  delete design.approval;
  design.assets = {
    artwork: product.assets?.artwork || null,
    printFiles: structuredClone(product.assets?.printFiles || []),
    mockups: (product.assets?.mockups || []).filter(
      (file) =>
        !PROVIDER_MOCKUP_PATTERN.test(file) &&
        !/(?:^|-)photoshoot-[a-z0-9-]+\.(?:jpe?g|png|webp)$/i.test(file),
    ),
  };
  return design;
}

export function postCriticProductProjection(product) {
  if (!product || typeof product !== 'object') return product;
  const reviewed = structuredClone(product);
  delete reviewed.workflow;
  delete reviewed.approval;
  return reviewed;
}

export function buildPostCriticCheckpoint({product, assetHashes, criticArtifact}) {
  return {
    postCriticProductHash: hashJson(postCriticProductProjection(product)),
    postCriticAssetHashes: structuredClone(assetHashes || {}),
    finalCriticArtifactHash: hashJson(criticArtifact),
  };
}

export function assertPostCriticCheckpoint(
  run,
  {product, assetHashes, criticArtifact},
) {
  if (
    !run.postCriticProductHash ||
    hashJson(postCriticProductProjection(product)) !== run.postCriticProductHash
  ) {
    throw new Error('Post-critic product changed after final visual approval');
  }
  if (
    !run.postCriticAssetHashes ||
    hashJson(assetHashes) !== hashJson(run.postCriticAssetHashes)
  ) {
    throw new Error('Post-critic assets changed after final visual approval');
  }
  if (
    !run.finalCriticArtifactHash ||
    hashJson(criticArtifact) !== run.finalCriticArtifactHash
  ) {
    throw new Error('Final visual critic artifact changed after approval');
  }
  if (!criticArtifact?.gate?.passed || !criticArtifact?.prepress?.ok) {
    throw new Error('Final visual critic checkpoint is not an approved render');
  }
  assertGpt56ResponseMetadata(criticArtifact.response, 'final visual critic checkpoint');
  if (
    criticArtifact.response.responseId !== run.finalCriticResponseId ||
    criticArtifact.response.model !== run.finalCriticModel
  ) {
    throw new Error('Final visual critic provenance changed after approval');
  }
}

async function verifyPostCriticCheckpoint(run, product) {
  const criticArtifact = await readWeeklyArtifact(
    run.identity,
    'final-visual-critic',
  );
  const assetHashes = await hashProductAssets(product);
  assertPostCriticCheckpoint(run, {
    product,
    assetHashes,
    criticArtifact,
  });
  return assetHashes;
}

function workflowAtLeast(product, target) {
  const currentIndex = WORKFLOW_STATUS_ORDER.indexOf(product?.workflow?.status);
  const targetIndex = WORKFLOW_STATUS_ORDER.indexOf(target);
  return currentIndex >= targetIndex && targetIndex >= 0;
}

function providerMockupsReady(product) {
  return (
    workflowAtLeast(product, 'mockups_ready') &&
    (product?.assets?.mockups || []).some((file) => PROVIDER_MOCKUP_PATTERN.test(file))
  );
}

function assertGpt56ResponseMetadata(response, label) {
  if (
    !response?.responseId ||
    !/^gpt-5\.6(?:[-.][a-z0-9.-]+)?$/i.test(response?.model || '')
  ) {
    throw new Error(`${label} is missing verified GPT-5.6 response provenance`);
  }
}

export function releaseStage(run) {
  return run.status === 'release_failed' ? run.resumeFrom : run.status;
}

export function liveReleaseProvenance(run) {
  const liveX = run.inputMode === 'live-x';
  const liveModels = run.offlineModels === false;
  const preparedMutationRun = run.dryRun === false;
  return {
    liveX,
    liveModels,
    preparedMutationRun,
    releasable: liveX && liveModels && preparedMutationRun,
  };
}

export function assertReplayInputMode(existing, requestedInputMode) {
  if (!existing?.inputHash) return;
  if (!['fixture', 'live-x'].includes(existing.inputMode)) {
    throw new Error('Existing weekly run is missing trustworthy input provenance');
  }
  if (existing.inputMode !== requestedInputMode) {
    throw new Error(
      `Existing weekly run uses ${existing.inputMode}; refusing to relabel it as ${requestedInputMode}`,
    );
  }
}

async function assertLiveDecisionProvenance(identity, run) {
  const [snapshot, trend, recipes, critic] = await Promise.all([
    readWeeklyArtifact(identity, 'signal-snapshot'),
    readWeeklyArtifact(identity, 'trend-model-output'),
    readWeeklyArtifact(identity, 'garment-recipes'),
    readWeeklyArtifact(identity, 'visual-critic'),
  ]);
  const snapshotPosts = normalizeSignalPosts(snapshot?.posts || []);
  if (
    snapshot?.inputMode !== 'live-x' ||
    snapshot?.listId !== identity.listId ||
    snapshot?.count !== REQUIRED_POST_COUNT ||
    snapshot?.inputHash !== run.inputHash ||
    snapshotPosts.length !== REQUIRED_POST_COUNT ||
    snapshotPosts.some(
      (post) =>
        post.source?.provider !== 'x' ||
        String(post.source?.listId) !== identity.listId,
    ) ||
    hashJson(signalHashInput(snapshotPosts)) !== snapshot.inputHash
  ) {
    throw new Error('Release requires an intact 30-post snapshot collected from live X');
  }
  const responses = [
    trend?.response,
    recipes?.response,
    ...(critic?.attempts || [])
      .filter((attempt) => attempt?.gate?.passed)
      .map((attempt) => attempt.response),
  ];
  if (
    responses.length < 3 ||
    responses.some(
      (response) =>
        !response?.responseId ||
        !/^gpt-5\.6(?:[-.][a-z0-9.-]+)?$/i.test(response?.model || '') ||
        response.responseId === 'offline-fixture' ||
        response.model === 'offline-fixture',
    )
  ) {
    throw new Error('Release requires live model provenance for every approved decision');
  }
}

function signalHashInput(posts) {
  return posts.map((post) => ({
    id: post.id,
    text: post.text,
    authorId: post.authorId,
    createdAt: post.createdAt,
    metrics: post.metrics,
  }));
}

async function assertOnlyExpectedReleaseChanges(run, product) {
  const exact = new Set([
    ...(run.changedFiles || []),
    'merch/products.json',
    ...productAssetPaths(product),
  ]);
  const generatedMockupPrefixes = [
    `assets/mockups/${product.slug}-printful-`,
    `assets/mockups/${product.slug}-photoshoot-`,
  ];
  const changes = await gitStatusPaths();
  const unrelated = changes.filter(
    (file) =>
      !exact.has(file) &&
      !generatedMockupPrefixes.some((prefix) => file.startsWith(prefix)),
  );
  if (unrelated.length) {
    throw new Error(`Unexpected worktree changes: ${unrelated.join(', ')}`);
  }
}

function productAssetPaths(product) {
  return [
    product.assets?.artwork,
    ...(product.assets?.printFiles || []).map((asset) => asset.path),
    ...(product.assets?.mockups || []),
    ...(product.assets?.customerPhotos || []),
  ].filter(Boolean);
}

export function candidateRecoveryAssetPaths(products = []) {
  return [
    ...new Set(
      products.flatMap((product) => [
        ...productAssetPaths(product),
        `assets/mockups/${product.slug}-catalog.png`,
      ]),
    ),
  ].sort();
}

function weeklyAttemptIdentity(attempt, product, recipe) {
  return {
    attempt: attempt + 1,
    conceptId: recipe.conceptId,
    productTitle: product.title,
    productSlug: product.slug,
    assetPaths: candidateRecoveryAssetPaths([product]),
  };
}

export async function armPreparationRecovery(
  identity,
  {
    workspaceRoot = rootDir,
    catalogPath = productsPath,
    assetPaths = [],
    runRoot,
  } = {},
) {
  const artifactOptions = runRoot ? {runRoot} : {};
  const workspace = path.resolve(workspaceRoot);
  const catalog = recoveryWorkspacePath(workspace, catalogPath);
  const catalogBytes = await readFile(catalog.absolute);
  const assets = [];

  for (const assetPath of [...new Set(assetPaths)].sort()) {
    const asset = recoveryWorkspacePath(workspace, assetPath);
    if (!asset.relative.startsWith('assets/')) {
      throw new Error(`Preparation recovery asset must be under assets/: ${asset.relative}`);
    }
    let bytes;
    try {
      bytes = await readFile(asset.absolute);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const backupArtifact = bytes
      ? `preparation-before-${sha256(Buffer.from(asset.relative)).slice(0, 24)}.bin`
      : null;
    if (bytes) {
      await writeWeeklyBinaryArtifact(
        identity,
        backupArtifact,
        bytes,
        artifactOptions,
      );
    }
    assets.push({
      path: asset.relative,
      existed: Boolean(bytes),
      sha256: bytes ? sha256(bytes) : null,
      backupArtifact,
    });
  }

  const journal = {
    version: PREPARATION_RECOVERY_VERSION,
    active: true,
    runKey: identity.runKey,
    createdAt: new Date().toISOString(),
    catalog: {
      path: catalog.relative,
      bytesBase64: catalogBytes.toString('base64'),
      sha256: sha256(catalogBytes),
    },
    assets,
  };
  await writeWeeklyArtifact(
    identity,
    PREPARATION_RECOVERY_ARTIFACT,
    journal,
    artifactOptions,
  );
  return journal;
}

export async function recoverPreparationRecovery(
  identity,
  {
    workspaceRoot = rootDir,
    catalogPath = productsPath,
    runRoot,
    outcome = 'recovered-stale-preparation',
  } = {},
) {
  const artifactOptions = runRoot ? {runRoot} : {};
  const journal = await readWeeklyArtifact(
    identity,
    PREPARATION_RECOVERY_ARTIFACT,
    artifactOptions,
  );
  if (!journal?.active) return {recovered: false};
  if (
    journal.version !== PREPARATION_RECOVERY_VERSION ||
    journal.runKey !== identity.runKey
  ) {
    throw new Error('Preparation recovery journal does not belong to this run');
  }

  const workspace = path.resolve(workspaceRoot);
  const catalog = recoveryWorkspacePath(workspace, catalogPath);
  if (journal.catalog?.path !== catalog.relative) {
    throw new Error('Preparation recovery journal points at an unexpected catalog');
  }
  const originalCatalog = Buffer.from(journal.catalog.bytesBase64 || '', 'base64');
  if (sha256(originalCatalog) !== journal.catalog.sha256) {
    throw new Error('Preparation recovery catalog backup failed its hash check');
  }

  let currentCatalog = null;
  try {
    currentCatalog = await readFile(catalog.absolute);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const catalogRecovery = reconcilePreparationCatalog({
    originalCatalog,
    currentCatalog,
    runKey: identity.runKey,
  });
  if (catalogRecovery.mode === 'exact') {
    if (!currentCatalog || !currentCatalog.equals(originalCatalog)) {
      await atomicWriteBuffer(catalog.absolute, originalCatalog);
    }
  } else {
    await atomicWriteJson(catalog.absolute, catalogRecovery.products);
  }

  const quarantinedAssets = [];
  for (const entry of journal.assets || []) {
    const asset = recoveryWorkspacePath(workspace, entry.path);
    if (asset.relative !== entry.path || !asset.relative.startsWith('assets/')) {
      throw new Error(`Unsafe preparation recovery asset: ${entry.path}`);
    }
    if (entry.existed) {
      const backup = await readWeeklyBinaryArtifact(
        identity,
        entry.backupArtifact,
        artifactOptions,
      );
      if (!backup || sha256(backup) !== entry.sha256) {
        throw new Error(`Preparation asset backup failed its hash check: ${entry.path}`);
      }
      let current = null;
      try {
        current = await readFile(asset.absolute);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      if (current && sha256(current) !== entry.sha256) {
        quarantinedAssets.push(
          await preserveRecoveryAsset(
            identity,
            entry.path,
            current,
            artifactOptions,
          ),
        );
      }
      await atomicWriteBuffer(asset.absolute, backup);
      continue;
    }
    if (!existsSync(asset.absolute)) continue;
    const generated = await readFile(asset.absolute);
    quarantinedAssets.push(
      await preserveRecoveryAsset(
        identity,
        entry.path,
        generated,
        artifactOptions,
      ),
    );
    await unlink(asset.absolute);
  }

  const completed = {
    ...journal,
    active: false,
    outcome,
    recoveredAt: new Date().toISOString(),
    catalogRecovery: catalogRecovery.mode,
    quarantinedAssets,
  };
  await writeWeeklyArtifact(
    identity,
    PREPARATION_RECOVERY_ARTIFACT,
    completed,
    artifactOptions,
  );
  return {
    recovered: true,
    catalogRecovery: catalogRecovery.mode,
    quarantinedAssets,
  };
}

export async function restorePreparationRecoveryAssets(
  identity,
  assetPaths,
  {
    workspaceRoot = rootDir,
    runRoot,
    reason = 'rejected-candidate',
  } = {},
) {
  const artifactOptions = runRoot ? {runRoot} : {};
  const journal = await readWeeklyArtifact(
    identity,
    PREPARATION_RECOVERY_ARTIFACT,
    artifactOptions,
  );
  if (!journal?.active) {
    throw new Error('Cannot clean candidate assets without an active recovery journal');
  }
  if (
    journal.version !== PREPARATION_RECOVERY_VERSION ||
    journal.runKey !== identity.runKey
  ) {
    throw new Error('Preparation recovery journal does not belong to this run');
  }

  const workspace = path.resolve(workspaceRoot);
  const tracked = new Map((journal.assets || []).map((entry) => [entry.path, entry]));
  const requested = [...new Set(assetPaths || [])].sort();
  const quarantinedAssets = [];
  for (const requestedPath of requested) {
    const asset = recoveryWorkspacePath(workspace, requestedPath);
    const entry = tracked.get(asset.relative);
    if (!entry || asset.relative !== requestedPath) {
      throw new Error(`Rejected candidate asset is not recovery-tracked: ${requestedPath}`);
    }
    const quarantined = await restorePreparationAssetEntry({
      identity,
      workspace,
      entry,
      artifactOptions,
    });
    if (quarantined) quarantinedAssets.push(quarantined);
  }

  const cleanup = {
    reason,
    restoredAt: new Date().toISOString(),
    assetPaths: requested,
    quarantinedAssets,
  };
  await writeWeeklyArtifact(
    identity,
    PREPARATION_RECOVERY_ARTIFACT,
    {
      ...journal,
      candidateCleanups: [...(journal.candidateCleanups || []), cleanup],
    },
    artifactOptions,
  );
  return cleanup;
}

async function restorePreparationAssetEntry({
  identity,
  workspace,
  entry,
  artifactOptions,
}) {
  const asset = recoveryWorkspacePath(workspace, entry.path);
  if (asset.relative !== entry.path || !asset.relative.startsWith('assets/')) {
    throw new Error(`Unsafe preparation recovery asset: ${entry.path}`);
  }
  if (entry.existed) {
    const backup = await readWeeklyBinaryArtifact(
      identity,
      entry.backupArtifact,
      artifactOptions,
    );
    if (!backup || sha256(backup) !== entry.sha256) {
      throw new Error(`Preparation asset backup failed its hash check: ${entry.path}`);
    }
    let current = null;
    try {
      current = await readFile(asset.absolute);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const quarantined =
      current && sha256(current) !== entry.sha256
        ? await preserveRecoveryAsset(identity, entry.path, current, artifactOptions)
        : null;
    await atomicWriteBuffer(asset.absolute, backup);
    return quarantined;
  }
  if (!existsSync(asset.absolute)) return null;
  const generated = await readFile(asset.absolute);
  const quarantined = await preserveRecoveryAsset(
    identity,
    entry.path,
    generated,
    artifactOptions,
  );
  await unlink(asset.absolute);
  return quarantined;
}

async function preserveRecoveryAsset(identity, assetPath, bytes, artifactOptions) {
  const quarantineArtifact = `preparation-recovered-${sha256(
    Buffer.from(assetPath),
  ).slice(0, 16)}-${sha256(bytes).slice(0, 16)}.bin`;
  await writeWeeklyBinaryArtifact(
    identity,
    quarantineArtifact,
    bytes,
    artifactOptions,
  );
  return {path: assetPath, artifact: quarantineArtifact};
}

export async function completePreparationRecovery(identity, outcome, {runRoot} = {}) {
  const artifactOptions = runRoot ? {runRoot} : {};
  const journal = await readWeeklyArtifact(
    identity,
    PREPARATION_RECOVERY_ARTIFACT,
    artifactOptions,
  );
  if (!journal?.active) return;
  await writeWeeklyArtifact(
    identity,
    PREPARATION_RECOVERY_ARTIFACT,
    {
      ...journal,
      active: false,
      outcome,
      completedAt: new Date().toISOString(),
    },
    artifactOptions,
  );
}

function reconcilePreparationCatalog({originalCatalog, currentCatalog, runKey}) {
  if (!currentCatalog || currentCatalog.equals(originalCatalog)) {
    return {mode: 'exact'};
  }
  let originalProducts;
  let currentProducts;
  try {
    originalProducts = JSON.parse(originalCatalog.toString('utf8'));
    currentProducts = JSON.parse(currentCatalog.toString('utf8'));
  } catch {
    throw new Error(
      'Cannot recover preparation over an unreadable catalog; unrelated bytes were preserved',
    );
  }
  if (!Array.isArray(originalProducts) || !Array.isArray(currentProducts)) {
    throw new Error('Preparation recovery requires array-based catalog snapshots');
  }

  const belongsToRun = (product) => product?.automation?.runKey === runKey;
  const originalOthers = originalProducts.filter((product) => !belongsToRun(product));
  const currentOthers = currentProducts.filter((product) => !belongsToRun(product));
  if (hashJson(originalOthers) === hashJson(currentOthers)) {
    return {mode: 'exact'};
  }

  const originalRunProducts = originalProducts.filter(belongsToRun);
  const firstCurrentRunIndex = currentProducts.findIndex(belongsToRun);
  const originalRunIndex = originalProducts.findIndex(belongsToRun);
  const insertionSource = firstCurrentRunIndex >= 0 ? firstCurrentRunIndex : originalRunIndex;
  const insertionIndex = Math.max(
    0,
    Math.min(
      currentOthers.length,
      insertionSource < 0
        ? currentOthers.length
        : currentProducts
            .slice(0, insertionSource)
            .filter((product) => !belongsToRun(product)).length,
    ),
  );
  currentOthers.splice(insertionIndex, 0, ...originalRunProducts);
  return {mode: 'surgical', products: currentOthers};
}

function recoveryWorkspacePath(workspaceRoot, filePath) {
  const absolute = path.resolve(workspaceRoot, filePath);
  if (!absolute.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error(`Unsafe preparation recovery path: ${filePath}`);
  }
  return {
    absolute,
    relative: path.relative(workspaceRoot, absolute).split(path.sep).join('/'),
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function weeklyDefinitionHashes() {
  const files = [
    'scripts/prompts/weekly-trend.md',
    'scripts/prompts/weekly-art-director.md',
    'scripts/prompts/weekly-visual-critic.md',
    'merch/weekly/schemas/trend.schema.json',
    'merch/weekly/schemas/art-direction.schema.json',
    'merch/weekly/schemas/visual-critic.schema.json',
  ];
  const result = {};
  for (const file of files) {
    result[file] = createHash('sha256')
      .update(await readFile(path.join(rootDir, file)))
      .digest('hex');
  }
  return result;
}

export function criticImagePaths(product, options = {}) {
  const workspaceRoot = path.resolve(options.rootDir || rootDir);
  const mockups = product?.assets?.mockups || [];
  const printFiles = product?.assets?.printFiles || [];
  const priorityMockups = ['catalog', 'front', 'back', 'patterns'].flatMap((role) =>
    mockups.filter((file) => criticMockupRole(file) === role),
  );
  const labelPreviews = ['label_panel', 'label_inside'].flatMap((placement) =>
    printFiles
      .filter((asset) => asset?.placement === placement)
      .map((asset) => asset.path),
  );
  const prioritized = [...priorityMockups, ...labelPreviews];
  const prioritySet = new Set(prioritized);
  const fallbacks = options.preferCustomer
    ? [
        ...(product?.assets?.customerPhotos || []),
        ...mockups.filter((file) => !prioritySet.has(file)),
        ...printFiles.map((asset) => asset.path).filter((file) => !prioritySet.has(file)),
      ]
    : [
        ...mockups.filter((file) => !prioritySet.has(file)),
        ...printFiles.map((asset) => asset.path).filter((file) => !prioritySet.has(file)),
        ...(product?.assets?.customerPhotos || []),
      ];

  const ordered = [...prioritized, ...fallbacks];
  return [...new Set(ordered)]
    .filter(Boolean)
    .map((file) => path.resolve(workspaceRoot, file))
    .filter((file) => existsSync(file))
    .slice(0, 6);
}

function criticMockupRole(file) {
  const match = path.basename(String(file || '')).match(
    /-(catalog|front|back|patterns)\.[a-z0-9]+$/i,
  );
  return match?.[1]?.toLowerCase() || null;
}

async function runMerchCommand(args) {
  return runCommand(process.execPath, ['scripts/merch.mjs', ...args]);
}

async function runReleaseVerification() {
  await runCommand('npm', ['run', 'merch:validate']);
  await runCommand('npm', ['test']);
  await runCommand('npm', ['run', 'typecheck']);
  await runCommand('npm', ['run', 'lint']);
  await runCommand('npm', ['run', 'build']);
}

async function runCommand(command, args) {
  const result = await execFileAsync(command, args, {
    cwd: rootDir,
    env: process.env,
    maxBuffer: 20_000_000,
  });
  return result.stdout;
}

async function commitFiles(files, message) {
  await runCommand('git', ['add', '--', ...files]);
  const staged = await execFileAsync('git', ['diff', '--cached', '--quiet'], {
    cwd: rootDir,
  }).then(
    () => false,
    (error) => {
      if (error.code === 1) return true;
      throw error;
    },
  );
  if (staged) await runCommand('git', ['commit', '-m', message]);
  return currentHead();
}

async function pushBranch(branch) {
  await runCommand('git', ['push', 'origin', branch]);
}

async function currentBranch() {
  const {stdout} = await execFileAsync('git', ['branch', '--show-current'], {
    cwd: rootDir,
  });
  return stdout.trim();
}

async function currentHead() {
  const {stdout} = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: rootDir,
  });
  return stdout.trim();
}

async function waitForPublicAssets(siteUrl, hashes) {
  for (const [file, expectedHash] of Object.entries(hashes)) {
    await waitForUrl(`${trimSlash(siteUrl)}/${file}`, {expectedHash});
  }
}

export async function runVerifiedProviderMutation({
  siteUrl,
  assetHashes,
  verifyAssets = waitForPublicAssets,
  mutate,
}) {
  if (!siteUrl || !assetHashes || typeof mutate !== 'function') {
    throw new Error('Provider mutation requires a site, asset hashes, and mutation');
  }
  await verifyAssets(siteUrl, assetHashes);
  return mutate();
}

async function waitForPublicProduct(siteUrl, product) {
  await waitForUrl(`${trimSlash(siteUrl)}/products/${product.commerce.handle}`);
  if (!product.providerRefs.printful?.productId) {
    throw new Error('Published product has no Printful product ID');
  }
  if (!(product.providerRefs.printful.variants || []).some((variant) => variant.available)) {
    throw new Error('Published product has no available Printful sync variant');
  }
  await waitForPublicCommerceReadiness(siteUrl, product);
}

async function waitForPublicCommerceReadiness(siteUrl, product) {
  const timeoutMs = positiveInteger(process.env.MERCH_DEPLOY_TIMEOUT_MS, 10 * 60_000);
  const pollMs = positiveInteger(process.env.MERCH_DEPLOY_POLL_MS, 10_000);
  const expectedMode = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')
    ? 'test'
    : 'live';
  const url = `${trimSlash(siteUrl)}/api/readiness?product=${encodeURIComponent(product.slug)}`;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, {
        headers: {'Cache-Control': 'no-cache'},
        signal: AbortSignal.timeout(Math.min(15_000, timeoutMs)),
      });
      if (response.ok) {
        const result = await response.json();
        if (publicCommerceReadinessMatches(result, product, expectedMode)) {
          return;
        }
      }
    } catch {
      // The final deployment or its commerce configuration may still be converging.
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Timed out waiting for public commerce readiness: ${url}`);
}

export function publicCommerceReadinessMatches(result, product, expectedMode) {
  const expectedVariant = (product?.commerce?.variants || []).find((variant) => {
    const mapping = (product?.providerRefs?.printful?.variants || []).find(
      (candidate) => candidate.variantId === variant.id,
    );
    return (
      variant.availableForSale &&
      mapping?.available &&
      Number.isInteger(mapping.syncVariantId) &&
      mapping.syncVariantId > 0
    );
  });
  return Boolean(
    result?.ready === true &&
      expectedVariant &&
      result.productSlug === product.slug &&
      result.handle === product.commerce.handle &&
      result.title === product.title &&
      result.variantId === expectedVariant.id &&
      result.currency === product.commerce.currency &&
      result.unitAmount === product.commerce.unitAmount &&
      result.provider === product.production.provider &&
      result.paymentMode === expectedMode &&
      result.databaseReady === true &&
      result.stripeReady === true &&
      result.printfulAutoConfirm === false,
  );
}

async function waitForUrl(url, {expectedHash, expectedText} = {}) {
  const timeoutMs = positiveInteger(process.env.MERCH_DEPLOY_TIMEOUT_MS, 10 * 60_000);
  const pollMs = positiveInteger(process.env.MERCH_DEPLOY_POLL_MS, 10_000);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${url}?weekly_check=${Date.now()}`, {
        headers: {'Cache-Control': 'no-cache'},
        signal: AbortSignal.timeout(Math.min(15_000, timeoutMs)),
      });
      if (response.ok) {
        if (expectedHash) {
          const actual = createHash('sha256')
            .update(Buffer.from(await response.arrayBuffer()))
            .digest('hex');
          if (actual === expectedHash) return;
        } else if (expectedText) {
          if ((await response.text()).includes(expectedText)) return;
        } else {
          return;
        }
      }
    } catch {
      // Deployment may still be starting; continue bounded polling.
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Timed out waiting for deployed URL: ${url}`);
}

async function pollPrintfulMockups(slug) {
  const attempts = positiveInteger(process.env.MERCH_MOCKUP_POLL_ATTEMPTS, 30);
  const intervalMs = positiveInteger(process.env.MERCH_MOCKUP_POLL_MS, 10_000);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await runMerchCommand(['mockups', '--slug', slug, '--poll']);
    const product = (await readProducts()).find((candidate) => candidate.slug === slug);
    if (providerMockupsReady(product)) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Printful mockups did not complete after ${attempts} polls`);
}

function requireReleaseEnvironment() {
  if (process.env.MERCH_WEEKLY_RELEASE_ENABLED !== 'true') {
    throw new Error('MERCH_WEEKLY_RELEASE_ENABLED=true is required for release');
  }
  if (process.env.PRINTFUL_AUTO_CONFIRM !== 'false') {
    throw new Error('PRINTFUL_AUTO_CONFIRM must remain false during the pilot');
  }
  deploymentProviderConfig();
  const requiredTrue = [
    'MERCH_PILOT_APPROVED',
    'CHECKOUT_ENABLED',
    'STOREFRONT_LEGAL_APPROVED',
    'STOREFRONT_TAX_SHIPPING_APPROVED',
  ];
  const disabled = requiredTrue.filter((name) => process.env[name] !== 'true');
  if (disabled.length) {
    throw new Error(`Release gates must be true: ${disabled.join(', ')}`);
  }
  const required = [
    'PUBLIC_SITE_URL',
    'PRINTFUL_TOKEN',
    'PRINTFUL_STORE_ID',
    'OPENAI_API_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'DATABASE_URL',
    'INNGEST_EVENT_KEY',
    'INNGEST_SIGNING_KEY',
    'STOREFRONT_CONTACT_EMAIL',
    'STOREFRONT_SHIPPING_POLICY',
    'STOREFRONT_RETURNS_POLICY',
    'STOREFRONT_PRIVACY_POLICY',
    'STOREFRONT_TERMS_POLICY',
    'STOREFRONT_CONTACT_POLICY',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing release env vars: ${missing.join(', ')}`);
  if (!/^https:\/\//.test(process.env.PUBLIC_SITE_URL)) {
    throw new Error('Release requires a public HTTPS site URL');
  }
  if (
    !process.env.STRIPE_SHIPPING_RATE_ID &&
    !process.env.STRIPE_FLAT_SHIPPING_AMOUNT
  ) {
    throw new Error('Release requires an approved Stripe shipping rate');
  }
}

function recipeFromProduct(product) {
  const spec = product.artDirector.aopSpec;
  return {
    conceptId: product.artDirector.selectedConceptId,
    title: product.title,
    rationale: product.meme.brief,
    brandLabel: spec.brandLabel,
    provenanceLine: spec.provenanceLine,
    layout: spec.layout,
    basePattern: spec.basePattern,
    palette: spec.palette,
    front: spec.front,
    back: spec.back,
    sleeves: spec.sleeves,
    label: spec.label,
    visualPrompt: product.prompts[0],
    rightsRisk: 'low',
  };
}

function publicTrendSummary(trend, decision) {
  return {
    name: trend.trendName,
    summary: trend.summary,
    score: decision.score,
    evidencePostCount: decision.evidencePostIds.length,
    evidenceAuthorCount: decision.evidenceAuthorCount,
    fingerprint: decision.fingerprint,
  };
}

function replaceProductByRun(products, product) {
  const index = products.findIndex(
    (candidate) => candidate.automation?.runKey === product.automation.runKey,
  );
  if (index < 0) throw new Error('Weekly product run key is missing from catalog');
  products[index] = product;
}

function findProductByRun(products, runKey) {
  return products.find((product) => product.automation?.runKey === runKey);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function validateRunId(value) {
  if (!/^[a-z0-9-]+$/i.test(String(value))) throw new Error('Unsafe run ID');
  return String(value);
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function readArg(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] || fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function trimSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function loadLocalEnv() {
  const configuredFile = process.env.MERCH_ENV_FILE
    ? path.resolve(process.env.MERCH_ENV_FILE)
    : null;
  const files = [
    configuredFile,
    path.join(rootDir, '.env.local'),
    path.join(rootDir, '.env'),
  ].filter(Boolean);

  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const line of String(readFileSync(file, 'utf8')).split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

function printRunSummary(run, extra = {}) {
  printJson({
    runId: run.identity?.runId,
    runKey: run.identity?.runKey,
    status: run.status,
    inputHash: run.inputHash,
    signalCount: run.signalCount,
    trend: run.trend,
    productSlug: run.productSlug,
    selectedConceptId: run.selectedConceptId,
    critic: run.critic,
    changedFiles: run.changedFiles,
    releasePlanHash: run.releasePlanHash,
    candidateDeployment: run.candidateDeployment,
    finalDeployment: run.finalDeployment,
    publicUrl: run.publicUrl,
    error: run.error,
    ...extra,
  });
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
