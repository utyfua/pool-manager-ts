/**
 * Limit function executions calls to one in one moment of time
 * 
 * Takes in a function `func` as an argument and returns a new function that limits the number of times 
 * `func` can be executed at any given moment in time. 
 * 
 * If `func` is called multiple times while it is already executing, 
 * the subsequent calls to `func` will be queued and will only be executed after the current execution of `func` has completed. 
 * 
 * This ensures that `func` is never executed concurrently, which can be useful in certain scenarios to avoid race conditions or other issues.
 * 
 * @param func function to wrap
 * @returns Limited function to work with
 */
export function limitedThreadFunction<F extends (...args: any[]) => Promise<any>>(func: F): F {
    // Define a queue to store calls to the returned function
    let queue: null | ((v?: 1) => void)[] = null;

    const execute = (...args: any[]) => new Promise(async (callback, reject) => {
        if (queue) await new Promise(cb => queue ? queue.push(cb) : (queue = [cb]));
        if (!queue) queue = [];
        try {
            const result = await func(...args);
            callback(result);
        } catch (error) {
            reject(error);
        }
        const next = queue?.shift();
        if (!queue?.length) queue = null;
        next && next();
    })
    return execute as F
}
