// node --expose-gc --inspect memory.playground.js 
const { PoolManager, ProcessPoolInstance } = require('./dist/index.js');
const { writeHeapSnapshot } = require("v8");

const timer = setInterval(() => { global.gc(); }, 1000);

const poolManager = new PoolManager()
const registry = new FinalizationRegistry((heldValue) => {
  console.log(`Finalizing: ${heldValue}`);
  clearInterval(timer);
});

async function runMain() {
  const pool = new ProcessPoolInstance({
    manager: poolManager,
    forkModulePath: 'test/Pool/childProcess.js',
    forkArgs: ['doNotCrush']
  })
  const dummyObj = {}
  registry.register(dummyObj, 'pool');
  await poolManager.startPools({
    pools: [pool],
  })
  pool[Symbol('test')] = dummyObj
  await pool.kill();
}

(async () => {
  await runMain();
  global.gc();
  writeHeapSnapshot();
})();

