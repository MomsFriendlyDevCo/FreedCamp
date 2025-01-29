import crypto from 'node:crypto';
import Cache from '@momsfriendlydevco/cache';
import Debug from 'debug';

const debug = Debug('freedcamp');


/**
* Helper funciton to detect simple POJOs
* @param {*} obj The object to examine
* @returns {Boolean} True if the given object is a POJO
* @see https://adamcoster.com/blog/pojo-detector
*/
export function isPlainObject(obj) {
	return (
		typeof obj === 'object' &&
		[null, Object.prototype].includes(Object.getPrototypeOf(obj))
	);
}

/**
* Freedcamp API auth
*/
export default class FCAuth {
	/**
	* Config object
	* See init() for schema
	* @type {Object}
	*/
	config = {};


	/**
	* Top level cache, provided to lower level instances unless overriden
	* @type {Cache}
	*/
	cache;


	/**
	* Scoop environment variables and/or config supplied
	* @param {Object} [options] Options to mutate behaviour
	* @param {String} [options.secret] FC Secret to use with auth
	* @param {String} [options.apikey] FC API-key to use with auth
	* @param {String} [options.project] Primary FC Project to work with
	* @param {String} [options.cache='filesystem'] Cache method to use on init
	* @returns {Promise<Cache>} This initialized cache instance
	*/
	init(options) {
		let settings = {
			cache: 'filesystem',
			...this.config,
			...options,
		};

		if (!settings.secret || !settings.apikey) throw new Error('Both `secret` and `apikey` settings are required to setup Freedcamp auth');
		if (!settings.project) throw new Error('Must specify a primary `project` to init Freedcamp auth');

		this.cache =
			typeof settings.cache == 'string' ? new Cache({
				modules: [settings.cache],
				keyMangle: k => `freedcamp/${k}`,
			})
			: Array.isArray(typeof settings.cache) ? new Cache({
				modules: settings.cache,
				keyMangle: k => `freedcamp/${k}`,
			})
			: isPlainObject(settings.cache) ? new Cache(settings.cache)
			: settings.cache;

		debug('Init with Api-key', settings.apikey.replace(/^(.{4})(.+?)(.{4})$/, (all, prefix, code, suffix) => `${prefix}${'x'.repeat(code.length)}${suffix}`));
		return Promise.resolve()
			.then(()=> this.cache?.init && this.cache.init()) // Init cache if it has a method to do that
			.then(()=> this);
	}


	/**
	* Return a mergable Axios prototype object with auth keys added
	* @param {Object} [base] Axios request to merge
	* @param {Object} [options] Additional options to mutate behaviour
	* @param {Boolean} [options.global=false] If false constrain search to the primary project, if true act as if we are searching all projects
	* @returns {Object} Partial AxiosRequest object to merge
	*/
	getAxiosPrototype(base = {}, options) {
		let settings = {
			global: false,
			...options,
		};

		let timestamp = new Date().valueOf();
		let hash = crypto.createHmac('sha1', this.config.secret)
			.update(this.config.apikey + timestamp)
			.digest('hex');

		return {
			method: 'GET',
			baseURL: 'https://freedcamp.com/api/v1',
			...base,
			params: {
				api_key: this.config.apikey,
				timestamp,
				hash,
				...(!options.global && {
					project_id: this.config.project,
				}),
				...base?.params,
			},
		}
	}


	/**
	* Instance constructor + optional config setup
	* @param {Object} Initial options to populate if specified, A call to `init` is still required
	*/
	constructor(options) {
		if (options) Object.assign(this.config, options);
	}
}
