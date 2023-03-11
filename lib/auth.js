import crypto from 'node:crypto';
import Cache from '@momsfriendlydevco/cache';
import {DotEnv} from '@momsfriendlydevco/dotenv';
import Debug from 'debug';

const debug = Debug('freedcamp');

/**
* Freedcamp API auth
*/
export default class FCAuth {
	/**
	* DotEnv parsed config object
	* See init() for schema
	* @type {Object}
	*/
	config;


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
	* @param {String} [options.cache] Cache method to use on init
	*/
	init(options) {
		this.config = new DotEnv()
			.parse(['.env'])
			.set({
				FREEDCAMP_SECRET: options?.secret,
				FREEDCAMP_APIKEY: options?.apikey,
				FREEDCAMP_PROJECT: options?.project,
				FREEDCAMP_CACHE_METHOD: options?.cache,
			})
			.schema({
				FREEDCAMP_SECRET: {type: String, required: true},
				FREEDCAMP_APIKEY: {type: String, required: true},
				FREEDCAMP_PROJECT: {type: String, required: true},
				FREEDCAMP_CACHE_METHOD: {type: String, default: 'filesystem'},
			})
			.value()

		this.cache = new Cache({
			modules: [this.config.FREEDCAMP_CACHE_METHOD],
			keyMangle: k => `freedcamp/${k}`,
		});

		debug('Init with Api-key', this.config.FREEDCAMP_APIKEY.replace(/^(.{4})(.+?)(.{4})$/, (all, prefix, code, suffix) => `${prefix}${'x'.repeat(code.length)}${suffix}`));
		return this.cache.init();
	}


	/**
	* Return a mergable Axios prototype object with auth keys added
	* @param {Object} [options] Axios request to merge
	* @returns {Object} Partial AxiosRequest object to merge
	*/
	getAxiosPrototype(options) {
		let timestamp = new Date().valueOf();
		let hash = crypto.createHmac('sha1', this.config.FREEDCAMP_SECRET)
			.update(this.config.FREEDCAMP_APIKEY + timestamp)
			.digest('hex');

		return {
			method: 'GET',
			baseURL: 'https://freedcamp.com/api/v1',
			...options,
			params: {
				api_key: this.config.FREEDCAMP_APIKEY,
				timestamp,
				hash,
				project_id: this.config.FREEDCAMP_PROJECT,
				...options?.params,
			},
		}
	}
}
