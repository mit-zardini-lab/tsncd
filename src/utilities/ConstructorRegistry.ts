type Type<K> = new (...args: any[]) => K;
type Func<V> = (...args: any[]) => V;

export class ConstructorRegistry<K, V, Args extends any[] = any[]> {

    private functionRegistry: Map<string, Func<V>>;
    public classRegistry: Map<string, Type<V>>;
    private default?: ['func', Func<V>] | ['type', Type<V>];

    constructor() {
        this.functionRegistry = new Map();
        this.classRegistry = new Map();
    }
    public registerFunction(targetType: Type<K>) {
        const functionRegistry = this.functionRegistry;
        return function register(_func: Func<V>) {
            functionRegistry.set(targetType.name, _func);
            return _func;
        }
    }
    public registerDefaultFunc(_func: Func<V>) {
        this.default = ['func', _func];
        return _func;
    }
    public registerClass<Y extends V>(targetType: Type<K>) {
        const classRegistry = this.classRegistry;
        return function register<Z extends Type<Y>>(_type: Z) {
            classRegistry.set(targetType.name, _type);
            return _type;
        }
    }
    public registerDefaultClass<Z extends Type<V>>(_type: Z) {
        this.default = ['type', _type];
        return _type;
    }
    public getAndProcess(...target: Args): V {
        const name = target[0].constructor.name;
        const _func = this.functionRegistry.get(name);
        if (_func !== undefined) {
            return _func(...target);
        }
        const _type = this.classRegistry.get(name);
        if (_type !== undefined) {
            return new _type(...target);
        }
        if (this.default !== undefined) {
            return (this.default[0] === 'func' 
                ? this.default[1](...target) 
                : new this.default[1](...target));
        }
        throw new Error(`No constructor or function registered for target ${target}`);
    }
    public getConstructor(key: K): (...args: Args) => V {
        const name = (key as object).constructor.name;
        const _type = this.classRegistry.get(name);
        if (_type !== undefined) {
            return (...args: Args) => new _type(...args);
        }
        const _func = this.functionRegistry.get(name);
        if (_func !== undefined) {
            return _func;
        }
        const fallback = this.default;
        if (fallback !== undefined && fallback[0] === 'func') {
            return fallback[1];
        } else if (fallback !== undefined && fallback[0] === 'type') {
            return (...args: Args) => new (fallback[1] as new (...args: Args) => V)(...args);
        }
        throw new Error(`No constructor or function registered for target ${key}`);
    }

}