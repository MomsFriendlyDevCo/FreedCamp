import crypto from 'node:crypto';
import Cache from '@momsfriendlydevco/cache';
import Debug from 'debug';

const debug = Debug('freedcamp');

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
	* @param {String} [options.project] FC Project to work with
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
		if (!settings.project) throw new Error('Must specify `project` to init Freedcamp auth');

		this.cache = new Cache({
			modules: [settings.cache],
			keyMangle: k => `freedcamp/${k}`,
		});

		debug('Init with Api-key', settings.apikey.replace(/^(.{4})(.+?)(.{4})$/, (all, prefix, code, suffix) => `${prefix}${'x'.repeat(code.length)}${suffix}`));
		return this.cache.init()
			.then(()=> this);
	}


	/**
	* Return a mergable Axios prototype object with auth keys added
	* @param {Object} [options] Axios request to merge
	* @returns {Object} Partial AxiosRequest object to merge
	*/
	getAxiosPrototype(options) {
		let timestamp = new Date().valueOf();
		let hash = crypto.createHmac('sha1', this.config.secret)
			.update(this.config.apikey + timestamp)
			.digest('hex');

		return {
			method: 'GET',
			baseURL: 'https://freedcamp.com/api/v1',
			...options,
			params: {
				api_key: this.config.apikey,
				timestamp,
				hash,
				project_id: this.config.project,
				...options?.params,
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
