const AOP_COTTON_REQUIRED_PLACEMENTS = [
  'front',
  'back',
  'left_sleeve',
  'right_sleeve',
  'label_panel',
  'label_inside',
];

export function artDirectionPrompt(artDirection) {
  if (!artDirection) return '';

  return [
    `Art direction: ${artDirection.name}.`,
    artDirection.positioning,
    ...(artDirection.pillars || []).map((rule) => `Style pillar: ${rule}.`),
    ...(artDirection.visualRules || []).map((rule) => `Visual rule: ${rule}`),
    ...(artDirection.aopGarmentRules || []).map((rule) => `AOP garment rule: ${rule}`),
    (artDirection.referenceScreenshots || []).length
      ? `Local art-direction reference screenshots: ${artDirection.referenceScreenshots.join(', ')}.`
      : '',
    `Use motifs only when they fit the product: ${(artDirection.motifBank || []).join(', ')}.`,
    ...(artDirection.negativePromptRules || []).map((rule) => `Avoid: ${rule}`),
  ]
    .filter(Boolean)
    .join(' ');
}

export function artDirectorReview(product, templateSpec, artDirection) {
  const findings = [];
  const production = product.production || {};
  const prompts = [product.meme?.brief, ...(product.prompts || [])]
    .filter(Boolean)
    .join(' ');
  const areas = new Set((production.placements || []).map((placement) => placement.area));
  const spec = product.artDirector?.aopSpec;
  const requiredPlacements = templateSpec?.requiredPlacements || [];

  if (production.technique !== 'All-Over Cotton') {
    findings.push('Rejected: art director validator is only for All-Over Cotton products.');
  }

  if (templateSpec?.kind !== 'all-over-cotton-sweatshirt') {
    findings.push('Rejected: selected template is not an all-over cotton sweatshirt.');
  }

  for (const area of requiredPlacements.length ? requiredPlacements : AOP_COTTON_REQUIRED_PLACEMENTS) {
    if (!areas.has(area)) findings.push(`Rejected: missing required AOP placement ${area}.`);
  }

  if (!spec) {
    findings.push('Rejected: missing artDirector.aopSpec garment plan.');
  } else {
    if (!spec.garmentFirst) findings.push('Rejected: aopSpec must set garmentFirst=true.');
    if (!spec.palette?.fabric || !spec.palette?.ink) {
      findings.push('Rejected: aopSpec needs fabric and ink palette values.');
    }
    if (/\b(TBD|placeholder|replace this|fill in)\b/i.test(JSON.stringify(spec))) {
      findings.push('Rejected: aopSpec still contains placeholder text.');
    }
    if (!spec.front?.primaryText && !spec.front?.mark) {
      findings.push('Rejected: front panel needs an intentional chest mark or primary text.');
    }
    if (!spec.sleeves?.motif) {
      findings.push('Rejected: sleeve system needs a dedicated motif.');
    }
    if (!spec.back?.statement) {
      findings.push('Rejected: back panel needs a quieter statement or back identity mark.');
    }
  }

  const banned = ['openai', 'chatgpt', 'supreme', 'nike', 'adidas'];
  for (const word of banned) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(prompts)) {
      findings.push(`Rejected: prompt uses protected/reference word "${word}".`);
    }
  }

  if (/poster collage|sticker.?bomb|dense collage|square artwork/i.test(prompts)) {
    findings.push('Rejected: prompt still asks for poster/collage logic.');
  }

  const accepted = findings.length === 0;
  return {
    accepted,
    score: accepted ? 92 : Math.max(0, 72 - findings.length * 12),
    reviewer: 'codex-aop-art-director-validator',
    checkedAt: new Date().toISOString(),
    referenceScreenshots: artDirection?.referenceScreenshots || [],
    templateSpec: {
      provider: templateSpec?.provider,
      baseProduct: templateSpec?.baseProduct,
      technique: templateSpec?.technique,
      requiredPlacements,
    },
    findings: accepted
      ? [
          'Accepted: garment-first AOP cotton plan with panel-specific sleeves, front, back, label panel, and inside label.',
          'Accepted: production files can be composed from exact selected template dimensions.',
        ]
      : findings,
  };
}
