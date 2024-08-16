import { ConfigItem, CrannAgent, DerivedState, StateSubscriber, DerivedInstanceState, DerivedCommonState } from "./model/crann.model";
import { connect as connectPorter } from 'porter-source'

export function connect<TConfig extends Record<string, ConfigItem<any>>>(config: TConfig, context?: string): CrannAgent<TConfig> {
    const [post, setMessages] = connectPorter({ namespace: 'crann' });
    let _state = getDerivedState(config);
    let changes: Partial<DerivedState<TConfig>> | null = null;
    const listeners = new Map<number, StateSubscriber<TConfig>>();
    let listenerId = 0;
    setMessages({
        stateUpdate: (message) => {
            changes = message.payload.state;
            _state = { ..._state, ...changes };
            if (!!changes) {
                listeners.forEach(listener => {
                    if (listener.keys === undefined) {
                        listener.callback(changes!);
                    } else {
                        const matchFound = listener.keys.some(key => changes!.hasOwnProperty(key))
                        matchFound && listener.callback(changes!);
                    }
                });
            }
        }
    });

    const get = () => _state;
    const set = (newState: Partial<DerivedState<TConfig>>) => {
        post({ action: 'setState', payload: { state: newState } });
    }
    const subscribe = (callback: (changes: Partial<DerivedState<TConfig>>) => void, keys?: Array<keyof DerivedState<TConfig>>): number => {
        listeners.set(++listenerId, { keys, callback });
        return listenerId;
    }
    const unsubscribe = (id: number) => {
        listeners.delete(id);
    }
    return { get, set, subscribe, unsubscribe };
}

function getDerivedState<TConfig extends Record<string, ConfigItem<any>>>(config: TConfig): (DerivedInstanceState<TConfig> & DerivedCommonState<TConfig>) {
    const instanceState = {} as DerivedInstanceState<TConfig>;

    Object.keys(config).forEach(key => {
        const item: ConfigItem<any> = config[key];
        if (item.partition === 'instance') {
            instanceState[key as keyof DerivedInstanceState<TConfig>] = item.default;
        }
    });

    const commonState = {} as DerivedCommonState<TConfig>;
    Object.keys(config).forEach(key => {
        const item: ConfigItem<any> = config[key];
        if (item.partition === 'instance') {
            commonState[key as keyof DerivedCommonState<TConfig>] = item.default;
        }
    });

    return { ...instanceState, ...commonState } as (DerivedInstanceState<TConfig> & DerivedCommonState<TConfig>);
}
