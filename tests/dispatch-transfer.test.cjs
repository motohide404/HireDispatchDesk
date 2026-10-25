const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../client/node_modules/typescript');

const start = '2025-10-03T09:00:00+09:00';
const end = '2025-10-03T10:00:00+09:00';
const attachment = { id: 'file-1', name: '指示書.pdf', type: 'application/pdf', url: 'blob:instructions', size: 100, addedAt: start };
const job = {
  id: 'job-1', title: '空港送迎', client: { type: '法人', name: 'テスト取引先' },
  start, end, preferClass: 'sedan', vehicleId: null, driverId: 7,
  amount: 12000, note: '到着ロビーで待機\n連絡先は指示書を参照', attachments: [attachment]
};

// Render the real board with in-memory React hooks, then exercise its event handlers.
// Child components and browser effects are left unmounted; this is not a browser test.
function board({ bookings = [], duties = [], jobs = [job] } = {}) {
  const hooks = [];
  const seeds = [bookings, duties, jobs];
  const arrayIndices = [];
  const alerts = [];
  let cursor = 0;
  let arraySeed = 0;
  let tree;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) {
        if (Array.isArray(initial)) {
          arrayIndices.push(index);
          hooks[index] = structuredClone(seeds[arraySeed++]);
        } else {
          hooks[index] = typeof initial === 'function' ? initial() : initial;
        }
      }
      return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useMemo: fn => fn(),
    useEffect() {}
  };
  const jsx = (type, props) => ({ type, props });
  const context = {
    exports: {},
    alert: message => alerts.push(message),
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name.endsWith('.css')) return {};
      if (name === './Calendar') return { default: () => null };
      if (name === '../lib/useFlashOnChange') return { useFlashOnChange: () => () => {} };
      throw new Error(`Unexpected import: ${name}`);
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '../client/src/components/VehicleDispatchBoardMock.tsx'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, context);
  const vehicles = [11, 12].map(id => ({ id, name: `車両${id}`, class: 'sedan', shakenExpiry: '2030-01-01', inspection3mExpiry: '2030-01-01' }));
  const drivers = [{ id: 7, name: 'テスト乗務員', code: 'D7', monthlyJobs: 0, extUsed: 0 }];
  function render() {
    cursor = 0;
    tree = context.exports.default({ vehicles, drivers });
  }
  function all(node) {
    if (Array.isArray(node)) return node.flatMap(item => all(item));
    if (!node || typeof node !== 'object') return [];
    return [node, ...all(node.props?.children)];
  }
  function find(predicate) {
    const found = all(tree).find(predicate);
    assert.ok(found, 'Expected element on the rendered board');
    return found;
  }
  function drop(element, type, id) {
    element.props.onDrop({
      preventDefault() {}, currentTarget: { classList: { toggle() {} } },
      dataTransfer: { getData: key => key === type ? String(id) : '' }
    });
    render();
  }
  render();
  return {
    alerts,
    assign(id = 'job-1', vehicleId = 11) {
      drop(find(node => node.props?.['data-vehicle-id'] === vehicleId), 'text/x-job-id', id);
    },
    bookings() { return all(tree).filter(node => node.type?.name === 'BookingBlock').map(node => node.props.booking); },
    jobs() { return hooks[arrayIndices[2]]; },
    returnByDrop(id) {
      drop(find(node => node.props?.onDrop?.name === 'handleJobPoolDrop'), 'text/x-booking-id', id);
    },
    returnByButton(id) {
      find(node => node.type?.name === 'BookingBlock' && node.props.booking.id === id).props.onClick();
      render();
      find(node => node.type?.name === 'DetailsPane').props.onReturn(id);
      render();
    }
  };
}

test('dispatch preserves the quote, multiline note, requested driver and attachments', () => {
  const view = board();
  view.assign();
  assert.equal(view.bookings().length, 1);
  const booking = view.bookings()[0];
  assert.equal(booking.amount, job.amount);
  assert.equal(booking.note, job.note);
  assert.equal(booking.driverId, job.driverId);
  assert.equal(booking.vehicleId, 11);
  assert.equal(booking.start, job.start);
  assert.equal(booking.end, job.end);
  assert.equal(JSON.stringify(booking.attachments), JSON.stringify(job.attachments));
  assert.equal(view.alerts.length, 0);
  assert.equal(view.jobs().length, 0);
  view.assign(); // The source job was removed, so another drop cannot duplicate it.
  assert.equal(view.bookings().length, 1);
});

test('zero quotes and missing optional fields are preserved without invented values', () => {
  for (const amount of [0, undefined]) {
    const view = board({ jobs: [{ ...job, amount, note: undefined, driverId: null, attachments: undefined }] });
    view.assign();
    const booking = view.bookings()[0];
    assert.equal(booking.amount, amount);
    assert.equal(booking.note, undefined);
    assert.equal(booking.driverId, null);
    assert.equal(booking.attachments, undefined);
  }
});

for (const method of ['returnByDrop', 'returnByButton']) {
  test(`${method}: a returned booking retains quote, note and attachments when reassigned`, () => {
    const view = board();
    view.assign();
    const bookingId = view.bookings()[0].id;
    view[method](bookingId);
    assert.equal(view.bookings().length, 0);
    view.assign(`J${bookingId}`, 12);
    const booking = view.bookings()[0];
    assert.ok(booking);
    assert.equal(booking.amount, job.amount);
    assert.equal(booking.note, job.note);
    assert.equal(JSON.stringify(booking.attachments), JSON.stringify(job.attachments));
    assert.equal(booking.driverId, null); // Returning to the pool deliberately releases the assignment.
    assert.equal(booking.vehicleId, 12);
  });
}

for (const kind of ['bookings', 'duties']) {
  test(`a requested driver already occupied by ${kind} is rejected without losing the source job`, () => {
    const existing = { id: kind === 'bookings' ? 99 : 'duty-99', vehicleId: 12, driverId: 7, start, end, client: job.client, title: '先約', service: 'GO' };
    const view = board({ [kind]: [existing] });
    view.assign();
    assert.equal(view.bookings().length, kind === 'bookings' ? 1 : 0);
    assert.match(view.alerts[0], /同一ドライバー/);
    assert.equal(JSON.stringify(view.jobs()), JSON.stringify([job]));
  });
}

test('back-to-back jobs for the same driver are allowed', () => {
  const view = board({ bookings: [{ ...job, id: 99, vehicleId: 12, start: '2025-10-03T08:00:00+09:00', end: start }] });
  view.assign();
  assert.equal(view.bookings().length, 2);
  assert.equal(view.alerts.length, 0);
});
