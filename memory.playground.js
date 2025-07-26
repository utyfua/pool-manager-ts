// node --expose-gc --inspect memory.playground.js 
const { PoolManager, ProcessPoolInstance } = require('./dist/index.js');

const timer = setInterval(() => { }, 1000);

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
  registry.register(pool, 'pool', dummyObj);
  await poolManager.startPools({
    pools: [pool],
  })
  pool[Symbol('test')] = dummyObj
  await pool.kill();
}

(async () => {
  await runMain();
  global.gc();
})();

