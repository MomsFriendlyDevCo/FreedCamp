import axios from 'axios';
import Debug from 'debug';

const debug = Debug('freedcamp');


/**
* Freedcamp Issues API
*/
export default class FCIssues {
	/**
	* Associated Auth class for FC
	* @type {FCAuth}
	*/
	auth;


	/**
	* Caching instance used to store issues
	* @type {Cache}
	*/
	cache;


	/**
	* Constructor
	* @param {Object} [optons] Options to initialize
	* @param {FCAuth} [options.auth] Auth instance to use
	*/
	constructor(options) {
		if (options.auth) {
			this.auth = options.auth;
			this.cache = options.auth.cache; // Inherit cache if it has one
		}

		if (options.cache) this.cache = options.cache;
	}


	/**
	* Fetch all issues and optionally cache for future reference
	* This function uses caching by default unless `options.cache.enabled=false`
	* @param {Object} [options] Options to mutate behaviour
	* @param {Number} [options.limit=100] How many issues to pull down at once
	* @param {Object} [options.cache] cache.worker() options
	* @returns {Promise<Array>} A collection representing all fetched issues
	*/
	fetchAll(options) {
		let settings = {
			limit: 100,
			startPage: 0,
			limitPage: 0,
			...options,
			cache: {
				enabled: false,
				id: 'fetchAll',
				expiry: '30m',
				...options?.cache,
			},
		};

		if (!this.auth) throw new Error('Auth not setup');

		return this.cache.worker(settings.cache, ()=> {
			let promises = []; // Promise actions to wait on - will correspond to cache writes

			debug('fetchAll()');
			return new Promise((resolve, reject) => {
				// Page fetcher {{{
				let fetchPage = page => {
					debug('Fetch page', page);
					Promise.resolve()
						.then(()=> axios(this.auth.getAxiosPrototype({
							method: 'GET',
							url: '/issues',
							params: {
								limit: settings.limit,
								offset: settings.limit * page,
							},
						})))
						.then(({data}) => {
							promises.push(...data.data.issues.map(issue =>
								this.cache.set(issue.number_prefixed, {
									id:  issue.number_prefixed,
									title: issue.title,
									assignee: issue.assigned_to_fullname,
									status: issue.status_title,
									priority: issue.priority_title,
									url: issue.url,
								})
							));

							debug(`Loaded ${promises.length} issues so far...`);

							if (settings.endPage > 0 && page + 1 >= settings.endPage) {
								debug(`Stopping at page ${page} with ${promises.length} issues`);
								return resolve();
							} else if (data.data.meta.has_more) { // More pages to scan
								fetchPage(page + 1);
							} else {
								debug(`Found ${promises.length} issues`);
								return resolve();
							}
						})
						.catch(reject)
				};
				fetchPage(settings.startPage);
				// }}}
			})
				.then(()=> Promise.all(promises)) // Wait for all cache setters to settle
		});
	}


	/**
	* Fetch an issue by ID
	* This will use the cached issue if it is available
	* @param {Object} [options] Options to mutate behaviour
	* @param {Object} [options.cache] cache.worker() options
	* @returns {Promise<Object>} The fetched issue
	*/
	get(id, options) {
		let settings = {
			cache: {
				enabled: false,
				id,
				expiry: '30m',
				...options?.cache,
			},
		};

		return this.cache.worker(settings.cache, ()=> Promise.resolve()
			.then(()=> debug(`Issue "${id}" not in cache, refreshing cache...`))
			.then(()=> this.fetchAll({
				cache: settings.cache,
			}))
			.then(items => items.filter(i => i.id == id))
			.then(items => {
				if (items.length == 0) {
					throw new Error(`Issue "${id}" not found`);
				} else if (items.length == 1) {
					return items[0];
				} else {
					throw new Error(`Unknown response for search of issue "${id}"`);
				}
			})
		);
	}
}
