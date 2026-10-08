// Issue #53: dragging a resize handle on a photo whose aspect ratio hits the
// cell's max-height cap (css — photos: `--cap-h` / `--ar`) updated `--w` and
// the on-screen percentage label, but the photo's rendered width never
// changed — the cap term of the `min()` in `.photo, .pr-fig` stayed smaller
// than every percentage the drag produced, so two different drags left the
// same unchanged photo claiming two different sizes, and the handle looked
// broken. The shown/stored percentage must always match what is actually
// rendered.
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, waitUntilTrue, unlock, withPage } from './browser.mjs';

// A portrait photo (narrow aspect ratio) added to the first general
// observation; narrow enough that, at full width, it is well past the
// default 4in general-observations height cap.
const addTallPhoto = (cdp, target) => evaluate(cdp, `(async () => {
  const c = document.createElement('canvas');
  c.width = 200; c.height = 400;
  c.getContext('2d').fillRect(0, 0, 200, 400);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  await addPhotosTo(${target}, [new File([blob], 'tall.jpg', { type: 'image/jpeg' })]);
})()`, { awaitPromise: true });

const GEN = "'gen:' + state.report.generalObservations[0].id";

function setup(fn) {
  return withPage(async (cdp) => {
    await unlock(cdp);
    await evaluate(cdp, `[...document.querySelectorAll('#sec-general button')]
      .find((b) => b.textContent.includes('Add general observation')).click()`);
    await waitUntilTrue(cdp, "!!document.querySelector('.gen-body .photo-cell')");
    await addTallPhoto(cdp, GEN);
    await waitUntilTrue(cdp, "!!document.querySelector('.gen-body .photo')");
    await evaluate(cdp, `selectPhoto(state.report.generalObservations[0].images[0])`);
    await waitUntilTrue(cdp, "document.querySelectorAll('.photo.selected .photo-handle').length === 4");
    await waitUntilTrue(cdp, "[...document.querySelectorAll('.photo img')].every((i) => i.complete && i.naturalWidth)");
    // Scroll so the top-right handle (same height as the drag) is reachable.
    await evaluate(cdp, "document.querySelector('.photo.selected').scrollIntoView({ block: 'start' }); window.scrollBy(0, -80);");
    await fn(cdp);
  });
}

// Press the selected photo's ne handle and drag it by dx px (the top corner
// stays reachable regardless of how tall the capped photo renders).
async function dragNE(cdp, dx) {
  const { x, y } = JSON.parse(await evaluate(cdp, `(() => {
    const r = document.querySelector('.photo.selected .photo-handle[data-corner=ne]').getBoundingClientRect();
    return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  })()`));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx, y, button: 'left' });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + dx, y, button: 'left', clickCount: 1 });
  await waitUntilTrue(cdp, "!!document.querySelector('.photo').style.getPropertyValue('--ar')");
  return JSON.parse(await evaluate(cdp, `JSON.stringify({
    width: document.querySelector('.photo').getBoundingClientRect().width,
    varw: Number(document.querySelector('.photo').style.getPropertyValue('--w')),
  })`));
}

test('two different drags that are both still held by the height cap report the same size', () => setup(async (cdp) => {
  // Both -200px and -500px request a width well above the cap (the photo's
  // rendered width cannot actually change at either), so the resulting
  // percentage must be identical, not two different numbers for one
  // unchanged photo.
  const a = await dragNE(cdp, -200);
  await evaluate(cdp, 'undo(); renderAll();');
  await waitUntilTrue(cdp, "!!document.querySelector('.photo').style.getPropertyValue('--ar')");
  const b = await dragNE(cdp, -500);
  assert.equal(a.width, b.width, 'the photo itself did not change size between the two drags');
  assert.equal(a.varw, b.varw, `a -200px drag (${a.varw}%) and a -500px drag (${b.varw}%) must agree once both are held by the same cap`);
}));

test('dragging a height-capped photo past the cap threshold actually shrinks it on screen', () => setup(async (cdp) => {
  const before = await evaluate(cdp, "document.querySelector('.photo').getBoundingClientRect().width");
  // Drag far enough that the requested width falls below the height cap
  // (and clear of the 33%-preset snap zone, so the result is unambiguous).
  const after = await dragNE(cdp, -860);
  assert.ok(after.width < before - 50, `photo should shrink well below ${before}px, got ${after.width}px`);
  // The stored/shown percentage must correspond to what is actually rendered.
  const { flowWidth, gap } = JSON.parse(await evaluate(cdp, `(() => {
    const flow = document.querySelector('.gen-body .photo-flow');
    return JSON.stringify({ flowWidth: flow.getBoundingClientRect().width, gap: parseFloat(getComputedStyle(flow).columnGap) || 0 });
  })()`));
  const impliedWidth = (after.varw / 100) * (flowWidth + gap) - gap;
  assert.ok(Math.abs(impliedWidth - after.width) < 2,
    `--w (${after.varw}%% -> ${impliedWidth}px) should match the rendered width (${after.width}px)`);
  const displayWidth = await evaluate(cdp, 'state.report.photos[state.report.generalObservations[0].images[0]].display.width');
  assert.equal(displayWidth, after.varw);
}));
