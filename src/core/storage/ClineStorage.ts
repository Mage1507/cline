import { Disposable } from "vscode"
import { StorageEventListener } from "./utils/types"

/**
 * An abstract storage class that provides a template for storage operations.
 * Subclasses must implement the protected abstract methods to define their storage logic.
 * The public methods (get, store, delete) are final and cannot be overridden.
 */
export abstract class ClineStorage {
	/**
	 * List of subscribers to storage change events.
	 */
	private readonly subscribers: Array<StorageEventListener> = []

	/**
	 * Subscribe to storage change events.
	 */
	public onDidChange(callback: StorageEventListener): Disposable {
		this.subscribers.push(callback)
		return new Disposable(() => {
			const callbackIndex = this.subscribers.indexOf(callback)
			this.subscribers.splice(callbackIndex, 1)
		})
	}

	/**
	 * Fire storage change event to all subscribers.
	 */
	protected async fire(key: string): Promise<void> {
		await Promise.all(this.subscribers.map((subscriber) => subscriber({ key })))
	}

	/**
	 * Get a value from storage. This method is final and cannot be overridden.
	 * Subclasses should implement _get() to define their storage retrieval logic.
	 */
	public async get(key: string): Promise<string | undefined> {
		return await this._get(key)
	}

	/**
	 * Store a value in storage. This method is final and cannot be overridden.
	 * Subclasses should implement _store() to define their storage logic.
	 * This method automatically fires change events after storing.
	 */
	public async store(key: string, value: string): Promise<void> {
		await this._store(key, value)
		await this.fire(key)
	}

	/**
	 * Delete a value from storage. This method is final and cannot be overridden.
	 * Subclasses should implement _delete() to define their deletion logic.
	 * This method automatically fires change events after deletion.
	 */
	public async delete(key: string): Promise<void> {
		await this._delete(key)
		await this.fire(key)
	}

	/**
	 * Abstract method that subclasses must implement to retrieve values from their storage.
	 */
	protected abstract _get(key: string): Promise<string | undefined>

	/**
	 * Abstract method that subclasses must implement to store values in their storage.
	 */
	protected abstract _store(key: string, value: string): Promise<void>

	/**
	 * Abstract method that subclasses must implement to delete values from their storage.
	 */
	protected abstract _delete(key: string): Promise<void>
}

/**
 * A simple in-memory implementation of ClineStorage using a Map.
 */
export class InMemoryClineStorage extends ClineStorage {
	/**
	 * A simple in-memory cache to store key-value pairs.
	 */
	private readonly _cache = new Map<string, string>()

	protected async _get(key: string): Promise<string | undefined> {
		return this._cache.get(key)
	}

	protected async _store(key: string, value: string): Promise<void> {
		this._cache.set(key, value)
	}

	protected async _delete(key: string): Promise<void> {
		this._cache.delete(key)
	}
}
