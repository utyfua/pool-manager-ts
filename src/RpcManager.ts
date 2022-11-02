import { setTimeout } from "node:timers/promises";
import { possiblyErrorObjectifyPromise, PossiblyErrorObjectifyType, possiblyErrorPlainParse } from "./possiblyErrorPlainObjectify";
import { TimeoutValue } from "./utils";

export interface RpcMessageBase {
    rpcId: string,
    rpcMessageId: string,
}
export interface RpcMessageRequest extends RpcMessageBase {
    action: 'request';
    message: any,
}

export interface RpcMessageResponse extends RpcMessageBase {
    action: 'response';
    message: PossiblyErrorObjectifyType,
}

export type RpcMessage = RpcMessageRequest | RpcMessageResponse

export interface RpcManagerDestination {
    send(message: RpcMessage): void
    on(eventName: 'message', handler: (rpcMessage: RpcMessage) => void): void
    on(eventName: 'close' | 'spawn', handler: () => void): void
    on(eventName: 'error', handler: (error: Error) => void): void
    off(eventName: 'message', handler: (rpcMessage: RpcMessage) => void): void
    off(eventName: 'close' | 'spawn', handler: () => void): void
    off(eventName: 'error', handler: (error: Error) => void): void
}

export interface RpcManagerOptions {
    destination: RpcManagerDestination;
    rpcId: string;
    handler: (message: any) => Promise<any> | any;
    requestTimeout?: TimeoutValue;
}

export class RpcManager {
    lastId: number = 0;
    getNewId() {
        if (this.lastId > 1000) this.lastId = 0;
        this.lastId++;
        return `rpcMessageId-${this.lastId}-${Date.now()}`;
    }

    constructor(public options: RpcManagerOptions) {
        const { destination } = options
        this.messageHandler = this.messageHandler.bind(this);
        this.closeHandler = this.closeHandler.bind(this);
        destination.on('message', this.messageHandler)
        destination.on('close', this.closeHandler)
        destination.on('error', this.closeHandler)
    }

    waitSpawn(): Promise<void> {
        return this.waitForEvent('spawn');
    }

    waitForEvent(eventName: 'close' | 'spawn'): Promise<void> {
        return new Promise((resolve, reject) => {
            const destination = this.options.destination
            function clean(next: (arg?: any) => void, arg?: any) {
                destination.off(eventName, onEvent)
                destination.off('error', onError)
                next(arg);
            }
            const onEvent = () => clean(resolve);
            const onError = (error: Error) => clean(reject, error);
            destination.on(eventName, onEvent)
            destination.on('error', onError)
        })
    }

    async messageHandler(message: RpcMessage) {
        // ignore message if we cant detect our identification
        if (typeof message !== 'object' || message.rpcId !== this.options.rpcId) return;

        if (message.action === 'request') {
            const responseMessage: RpcMessage = {
                rpcId: this.options.rpcId,
                rpcMessageId: message.rpcMessageId,
                action: 'response',
                message: await possiblyErrorObjectifyPromise(this.options.handler(message.message))
            }
            this.options.destination.send(responseMessage);
        }

        if (message.action === 'response') {
            const callback = this.responseCallbacks[message.rpcMessageId];
            if (callback)
                callback(message.message);
        }
    }

    responseCallbacks: Record<string, (message: PossiblyErrorObjectifyType) => void> = {};
    async request<Response = any>(
        message: any,
        { timeout = this.options.requestTimeout }:
            { timeout?: TimeoutValue } = {}
    ): Promise<Response> {
        const destination = this.options.destination;
        const requestMessage: RpcMessage = {
            rpcId: this.options.rpcId,
            rpcMessageId: this.getNewId(),
            action: 'request',
            message
        }

        destination.send(requestMessage);

        const promises = [
            new Promise<PossiblyErrorObjectifyType>((cb) => {
                this.responseCallbacks[requestMessage.rpcMessageId] = cb
            })
        ]

        if (typeof timeout === 'number') {
            promises.push(setTimeout(timeout).then(() => ({
                type: 'error',
                error: new Error('Timeout'),
            })))
        }

        const response = await Promise.race(promises);

        delete this.responseCallbacks[requestMessage.rpcMessageId];

        return possiblyErrorPlainParse(response);
    }

    closeHandler() {
        this.destroy();
    }
    destroy() {
        const destination = this.options.destination
        destination.off('message', this.messageHandler)
        destination.off('close', this.closeHandler)
        destination.off('error', this.closeHandler)

        const responseCallbacks = this.responseCallbacks;
        this.responseCallbacks = {};
        Object.values(responseCallbacks)
            .forEach((callback) => callback({
                type: 'error',
                error: new Error('Destination was closed'),
            }))
    }
}
