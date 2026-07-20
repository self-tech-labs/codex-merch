import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {
  aopCatalogMockupSvg,
  aopMockupSvg,
  aopPanelSvg,
  fitTextLayout,
} from './merch.mjs';

const baseSpec = {
  garmentFirst: true,
  brandLabel: 'LOCAL SYSTEMS STUDIO',
  provenanceLine: 'FIELD NOTE 01 / REVIEW CLIMATE STUDY',
  layout: 'offset-ledger',
  basePattern: 'status-isobar-map',
  palette: {
    fabric: '#111315',
    ink: '#F4F1E8',
    muted: '#767B78',
    accent: '#B7FF3C',
  },
  front: {
    primaryText: 'REVIEW PRESSURE',
    chestLabel: 'PATCH BAROMETER',
    mark: 'P↓',
    subline: 'SMALLER PATCHES / LOWER LOAD',
  },
  back: {
    statement: 'PRESSURE FALLS WITH SMALLER PATCHES',
    subline: 'QUEUE DEPTH: MANAGEABLE',
  },
  sleeves: {
    style: 'radar-rings',
    leftText: 'QUEUE DEPTH',
    rightText: 'CLEARING',
    caption: 'LOCAL CONDITIONS',
  },
  label: {line: 'LSS / FIELD ISSUE 01'},
};

const product = {
  slug: 'renderer-quality-fixture',
  title: 'Patch Pressure Cotton Sweatshirt',
  production: {
    technique: 'All-Over Cotton',
    textLayer: 'REVIEW PRESSURE',
  },
};

function assertFittedBounds(svg) {
  const matches = [...svg.matchAll(
    /data-fit-width="([\d.]+)" data-fit-height="([\d.]+)" data-fit-max-width="([\d.]+)" data-fit-max-height="([\d.]*)"/g,
  )];
  assert.ok(matches.length > 0, 'expected measurable fitted text groups');
  for (const match of matches) {
    const [, width, height, maxWidth, maxHeight] = match.map(Number);
    assert.ok(width <= maxWidth + 0.1, `${width} exceeded max width ${maxWidth}`);
    if (Number.isFinite(maxHeight) && maxHeight > 0) {
      assert.ok(height <= maxHeight + 0.1, `${height} exceeded max height ${maxHeight}`);
    }
  }
}

function textValues(svg) {
  return [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);
}

function sleeveTypePlacement(svg, side) {
  const match = svg.match(
    new RegExp(
      `<g transform="translate\\(([\\d.-]+) ([\\d.-]+)\\) rotate\\((-?[\\d.]+)\\)" data-aop-role="sleeve-type-${side}" data-aop-text-lane="outer" data-aop-primary-lane="([\\d.-]+)" data-aop-caption-lane="([\\d.-]+)"`,
    ),
  );
  assert.ok(match, `missing ${side} outer-sleeve typography placement`);
  const [, x, y, rotation, primaryLane, captionLane] = match.map(Number);
  return {x, y, rotation, primaryLane, captionLane};
}

function mappedSleeveLaneX({side, placement, lane}) {
  const panelX =
    placement.rotation === -90 ? placement.x + lane : placement.x - lane;
  const origin = side === 'left' ? 70 : 1010;
  return origin + panelX * 0.52;
}

test('fitted typography preserves every word while respecting its box', () => {
  const source = 'A deliberately long provenance statement that must remain complete';
  const layout = fitTextLayout({
    text: source,
    maxWidth: 420,
    maxHeight: 110,
    fontMax: 48,
    fontMin: 18,
    family: 'Arial, Helvetica, sans-serif',
    maxLineLength: 18,
    maxLines: 3,
  });

  assert.equal(layout.lines.join(' '), source.toUpperCase());
  assert.ok(layout.lines.length <= 3);
  assert.ok(layout.width <= 420);
  assert.ok(layout.height <= 110);
});

test('body panels keep typography safe and use the declared angular recipe', () => {
  const front = aopPanelSvg({product, spec: baseSpec, area: 'front', width: 1000, height: 1300});
  const back = aopPanelSvg({product, spec: baseSpec, area: 'back', width: 1000, height: 1300});

  for (const svg of [front, back]) {
    assert.match(svg, /data-aop-motif="status-isobar-map"/);
    assert.match(svg, /data-aop-role="provenance"/);
    assert.doesNotMatch(svg, /<polyline/);
    assertFittedBounds(svg);
  }
  assert.match(front, />P↓<\/text>/);
  assert.match(front, />REVIEW PRESSURE<\/text>/);
  assert.match(back, />PRESSURE FALLS<\/text>/);
  assert.match(back, />WITH SMALLER<\/text>/);
  assert.match(back, />PATCHES<\/text>/);
});

test('sleeve renderer realizes each declared style instead of a generic glyph stack', () => {
  for (const style of ['radar-rings', 'ladder', 'wave', 'glyph-stack']) {
    const spec = {
      ...baseSpec,
      sleeves: {...baseSpec.sleeves, style},
    };
    const left = aopPanelSvg({product, spec, area: 'left_sleeve', width: 1000, height: 1300});
    const right = aopPanelSvg({product, spec, area: 'right_sleeve', width: 1000, height: 1300});
    assert.match(left, new RegExp(`data-aop-motif="${style}"`));
    assert.match(right, new RegExp(`data-aop-motif="${style}"`));
    assert.doesNotMatch(left, />RUN<\/text>/);
    assert.doesNotMatch(right, />RUN<\/text>/);
    assertFittedBounds(left);
    assertFittedBounds(right);
  }
});

test('glyph-stack is shape-only and adds no invented semantic copy', () => {
  const spec = {
    ...baseSpec,
    sleeves: {...baseSpec.sleeves, style: 'glyph-stack'},
  };
  const left = aopPanelSvg({product, spec, area: 'left_sleeve', width: 1000, height: 1300});
  const right = aopPanelSvg({product, spec, area: 'right_sleeve', width: 1000, height: 1300});

  for (const [svg, expectedPrimary] of [
    [left, 'QUEUE DEPTH'],
    [right, 'CLEARING'],
  ]) {
    assert.match(svg, /data-aop-motif="glyph-stack" data-aop-semantic-copy="none"/);
    assert.deepEqual(textValues(svg), [expectedPrimary, 'LOCAL CONDITIONS']);
    assert.doesNotMatch(svg, />(?:RUN|01|\+\+|\/\/|&lt;&gt;)<\/text>/);
  }
});

test('catalog keeps sleeve type outside the torso seam and body type inside it', () => {
  const spec = {
    ...baseSpec,
    front: {
      ...baseSpec.front,
      primaryText: 'ASYNC REVIEW PRESSURE WINDOW SIGNAL',
    },
    sleeves: {
      ...baseSpec.sleeves,
      style: 'glyph-stack',
      leftText: 'ROUTE READY FOR REVIEW',
      rightText: 'CHECKS GREEN TO MERGE',
      caption: 'WINDOW MAP / TEST FIELD CONDITIONS',
    },
  };
  const catalog = aopCatalogMockupSvg({product, spec});
  const left = sleeveTypePlacement(catalog, 'left');
  const right = sleeveTypePlacement(catalog, 'right');

  assert.equal(left.rotation, -90);
  assert.equal(right.rotation, 90);
  assert.ok(left.y >= 700 && left.y <= 780);
  assert.ok(right.y >= 700 && right.y <= 780);

  for (const lane of [left.primaryLane, left.captionLane]) {
    const x = mappedSleeveLaneX({side: 'left', placement: left, lane});
    assert.ok(x >= 250 && x <= 360, `left sleeve lane mapped to unsafe x=${x}`);
  }
  for (const lane of [right.primaryLane, right.captionLane]) {
    const x = mappedSleeveLaneX({side: 'right', placement: right, lane});
    assert.ok(x >= 1240 && x <= 1360, `right sleeve lane mapped to unsafe x=${x}`);
  }

  const frontPrimary = catalog.match(
    /data-aop-role="front-primary"[^>]*data-fit-max-width="([\d.]+)"[^>]*><text x="([\d.]+)"/,
  );
  assert.ok(frontPrimary, 'missing fitted front-primary placement');
  const [, maxWidth, centerX] = frontPrimary.map(Number);
  const mappedLeft = 345 + (centerX - maxWidth / 2) * 0.91;
  const mappedRight = 345 + (centerX + maxWidth / 2) * 0.91;
  assert.ok(mappedLeft >= 450, `front copy crossed the left seam margin at x=${mappedLeft}`);
  assert.ok(mappedRight <= 1120, `front copy crossed the right seam margin at x=${mappedRight}`);
  assertFittedBounds(catalog);
});

test('catalog, technical flats, and pattern sheet share the panel renderer', async () => {
  const catalog = aopCatalogMockupSvg({product, spec: baseSpec});
  const technical = aopMockupSvg({product, spec: baseSpec, angle: 'front'});
  const patterns = aopMockupSvg({product, spec: baseSpec, angle: 'patterns'});

  assert.match(catalog, /data-aop-surface-source="shared"/);
  assert.match(technical, /data-aop-surface-source="shared"/);
  assert.equal((patterns.match(/data-aop-pattern-panel=/g) || []).length, 4);
  for (const svg of [catalog, technical, patterns]) {
    assert.match(svg, /data-aop-motif="status-isobar-map"/);
    assert.match(svg, /data-aop-motif="radar-rings"/);
    assert.doesNotMatch(svg, /<polyline/);
    assertFittedBounds(svg);
  }

  const renders = await Promise.all(
    [catalog, technical, patterns].map((svg) =>
      sharp(Buffer.from(svg)).png().toBuffer({resolveWithObject: true}),
    ),
  );
  assert.deepEqual(
    renders.map(({info}) => [info.width, info.height]),
    [[1600, 1600], [1600, 1200], [1600, 1200]],
  );
});

test('label-panel copy is fitted and does not inherit the torso motif', () => {
  const label = aopPanelSvg({
    product,
    spec: baseSpec,
    area: 'label_panel',
    width: 1000,
    height: 1300,
  });

  assert.match(label, />LOCAL SYSTEMS STUDIO<\/text>/);
  assert.match(label, />LSS \/ FIELD ISSUE 01<\/text>/);
  assert.doesNotMatch(label, /data-aop-motif="status-isobar-map"/);
  assertFittedBounds(label);
});
