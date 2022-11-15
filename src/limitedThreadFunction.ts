/**
 * Limit function executions calls to one in one moment of time
 * 
 * @param func function to wrap
 * @returns Limited function to work with
 */
export function limitedThreadFunction<A extends (...args: any[]) => Promise<any>>(func: A): A {
    let queue: null | ((v?: 1) => void)[] = null;

    const execute = (...args: any[]) => new Promise(async (callback, reject) => {
        if (queue) await new Promise(cb => queue?.push(cb) || (queue = [cb]));
        if (!queue) queue = [];
        try {
            const result = await func(...args);
            callback(result);
        } catch (error) {
            reject(error);
        }
        const next = queue.shift();
        if (!queue.length) queue = null;
        next && next();
    })
    return execute as A
}
