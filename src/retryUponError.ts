export interface retryUponErrorOptions {
    func: Function;
    attempts?: number;
    onerror?: (error: Error | unknown) => any | Promise<any>;
}

export async function retryUponError({ func, attempts = 3, onerror }: retryUponErrorOptions) {
    let lastError: Error | unknown | undefined;
    for (let i = 0; i < attempts; i++) {
        try {
            return await func();
        } catch (error) {
            if (onerror) await onerror(error);
            lastError = error;
        }
    }
    throw lastError;
}