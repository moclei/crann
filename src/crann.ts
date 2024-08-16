import browser from 'webextension-polyfill';
import { DerivedInstanceState, DerivedCommonState, ConfigItem, DerivedState, Partition, CrannAgent, StateSubscriber } from './model/crann.model';
import { source, } from 'porter-source';
import { deepEqual } from './utils/deepEqual';
import { AgentLocation, AgentMetadata } from 'porter-source/dist/types/porter.model';

export class Crann<TConfig extends Record<string, ConfigItem<any>>> {
    private instances: Map<string, DerivedInstanceState<TConfig>> = new Map();
    private defaultCommonState: DerivedCommonState<TConfig>;
    private defaultInstanceState: DerivedInstanceState<TConfig>;
    private commonState: DerivedCommonState<TConfig>;
    private stateChangeListeners: Array<(state: (DerivedCommonState<TConfig>) | (DerivedCommonState<TConfig> & DerivedInstanceState<TConfig>), changes: Partial<DerivedCommonState<TConfig> & DerivedInstanceState<TConfig>>, key?: string) => void> = [];
    private storagePrefix = 'crann_';
    private post: (message: any, contextOrKey: string, location?: Partial<AgentLocation>) => void = () => { };

    constructor(private config: TConfig, storagePrefix?: string) {
        console.log('Crann constructor');
        this.defaultInstanceState = this.initializeInstanceDefault();
        this.defaultCommonState = this.commonState = this.initializeCommonDefault();
        this.hydrate();
        const [post, _setMessages, onConnect, onDisconnect] = source('crann');
        this.post = post;
        onConnect(({ key, connectionType, context, location }) => {
            console.log('Crann porter connect', key, connectionType, context, location);
            this.addInstance(key);
            onDisconnect(({ key, connectionType, context, location }) => {
                console.log('Crann porter connect', key, connectionType, context, location);
                this.removeInstance(key);
            });
        });
        this.storagePrefix = storagePrefix ?? this.storagePrefix;
    }

    private async addInstance(key: string): Promise<void> {
        if (!this.instances.has(key)) {
            const initialInstanceState = { ...this.defaultInstanceState } as DerivedInstanceState<TConfig>;
            this.instances.set(key, initialInstanceState);
        } else {
            console.warn('Crann instance already exists', key);
        }
    }

    private async removeInstance(key: string): Promise<void> {
        if (this.instances.has(key)) {
            this.instances.delete(key);
        } else {
            console.warn('Crann instance does not exist', key);
        }
    }

    public async setCommonState(state: Partial<DerivedCommonState<TConfig>>): Promise<void> {
        const update = { ...this.commonState, ...state };
        if (!deepEqual(this.commonState, update)) {
            this.commonState = update;
            await this.persist(state);
            this.notify(state as Partial<DerivedState<TConfig>>);
        }
    }

    public async setInstanceState(key: string, state: Partial<DerivedInstanceState<TConfig>>): Promise<void> {
        const currentState = this.instances.get(key) || this.defaultInstanceState;
        const update = { ...currentState, ...state };
        if (!deepEqual(currentState, update)) {
            this.instances.set(key, update);
            this.notify(state as Partial<DerivedState<TConfig>>, key);
        }
    }

    // If we pass in specific state to persist, it only persists that state. 
    // Otherwise persists all of the worker state.
    private async persist(state?: Partial<DerivedCommonState<TConfig>>): Promise<void> {
        for (const key in (state || this.commonState)) {
            const item = this.config[key] as ConfigItem<any>;
            const persistence = item.persist || 'none';
            const value = state ? state[key as keyof DerivedCommonState<TConfig>] : this.commonState[key];
            switch (persistence) {
                case 'session':
                    await browser.storage.session.set({ [this.storagePrefix + (key as string)]: value });
                    break;
                case 'local':
                    await browser.storage.local.set({ [this.storagePrefix + (key as string)]: value });
                    break;
                default:
                    break;
            }
        }
    }

    public async clear(): Promise<void> {
        this.commonState = this.defaultCommonState;
        this.instances.forEach((_, key) => {
            this.instances.set(key, this.defaultInstanceState);
        });
        await this.persist();
        this.notify({});
    }

    public subscribe(listener: (state: (DerivedCommonState<TConfig>) | (DerivedInstanceState<TConfig> & DerivedCommonState<TConfig>), changes: Partial<DerivedInstanceState<TConfig> & DerivedCommonState<TConfig>>, key?: string) => void): void {
        this.stateChangeListeners.push(listener);
    }

    private notify(changes: Partial<DerivedCommonState<TConfig> & DerivedInstanceState<TConfig>>, key?: string): void {
        const state = key ? this.get(key) : this.get();
        this.stateChangeListeners.forEach(listener => listener(state, changes, key));
        if (key) {
            this.post({ action: 'stateUpdate', payload: { state: changes } }, key);
        } else {
            // for every key of this.instances, post the state update to the corresponding key
            this.instances.forEach((_, key) => {
                this.post({ action: 'stateUpdate', payload: { state: changes } }, key);
            });
        }
    }

    public get(): DerivedCommonState<TConfig>;
    public get(key: string): DerivedInstanceState<TConfig> & DerivedCommonState<TConfig>;
    public get(key?: string): ((DerivedInstanceState<TConfig> & DerivedCommonState<TConfig>) | DerivedCommonState<TConfig>) {
        if (!key) {
            return { ...this.commonState, ...{} as DerivedInstanceState<TConfig> };
        }
        return { ...this.commonState, ...this.instances.get(key) };
    }

    public async set(state: Partial<DerivedCommonState<TConfig>>): Promise<void>
    public async set(state: Partial<DerivedInstanceState<TConfig> & DerivedCommonState<TConfig>>, key: string): Promise<void>
    public async set(state: Partial<DerivedInstanceState<TConfig> | DerivedCommonState<TConfig>>, key?: string): Promise<void> {
        const instance = {} as Partial<DerivedInstanceState<TConfig>>;
        const worker = {} as Partial<DerivedCommonState<TConfig>>;

        for (const itemKey in state) {
            const item = this.config[itemKey as keyof TConfig] as ConfigItem<any>;
            if (item.partition === 'instance') {
                const instanceItemKey = itemKey as keyof DerivedInstanceState<TConfig>;
                const instanceState = state as Partial<DerivedInstanceState<TConfig>>;
                instance[instanceItemKey] = instanceState[instanceItemKey];
            } else if (!item.partition || item.partition === Partition.Common) {
                const commonItemKey = itemKey as keyof DerivedCommonState<TConfig>;
                const commonState = state as Partial<DerivedCommonState<TConfig>>;
                worker[commonItemKey] = commonState[commonItemKey]!;
            }
        }
        if (key) this.setInstanceState(key, instance);
        this.setCommonState(worker);
    }

    private async hydrate(): Promise<void> {
        const local = await browser.storage.local.get(null);
        const session = await browser.storage.session.get(null);
        const combined = { ...local, ...session };
        const update: Partial<DerivedCommonState<TConfig>> = {}; // Cast update as Partial<DerivedState<TConfig>>
        for (const prefixedKey in combined) {
            const key = this.removePrefix(prefixedKey);
            if (this.config.hasOwnProperty(key)) {
                const value = combined[key];
                update[key as keyof DerivedCommonState<TConfig>] = value;
            }
        }
        this.commonState = { ...this.defaultCommonState, ...update };
    }

    private removePrefix(key: string): string {
        if (key.startsWith(this.storagePrefix)) {
            return key.replace(this.storagePrefix, '');
        }
        return key;
    }

    private initializeInstanceDefault(): DerivedInstanceState<TConfig> {
        const instanceState: any = {};
        Object.keys(this.config).forEach(key => {
            const item: ConfigItem<any> = this.config[key];
            if (item.partition === 'instance') {
                instanceState[key] = item.default;
            }
        });
        return instanceState;
    }

    private initializeCommonDefault(): DerivedCommonState<TConfig> {
        const commonState: any = {};
        Object.keys(this.config).forEach(key => {
            const item: ConfigItem<any> = this.config[key];
            if (item.partition === Partition.Common) {
                commonState[key] = item.default;
            }
        });
        return commonState;
    }
}


export function create<TConfig extends Record<string, ConfigItem<any>>>(config: TConfig, storagePrefix?: string): Crann<TConfig> {
    return new Crann(config, storagePrefix);
}

