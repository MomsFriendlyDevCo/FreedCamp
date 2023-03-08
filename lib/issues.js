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
	* @param {Number} [options.offset=-1] Overriding offset to start pulling from, will pull once only and ignore page calculations, use `-1` to disable
	* @param {Object} [options.cache] cache.worker() options
	* @returns {Promise<Array>} A collection representing all fetched issues
	*/
	fetchAll(options) {
		let settings = {
			offset: -1,
			limit: 100,
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
								offset: settings.offset > -1
									? settings.offset
									: settings.limit * page,
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
									raw: issue,
								})
							));

							debug(`Loaded ${promises.length} issues so far...`);

							if (settings.offset > -1) {
								debug(`Stopping after ${promises.length} issues due to raw offset of ${settings.offset}`);
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
				fetchPage(0);
				// }}}
			})
				.then(()=> Promise.all(promises)) // Wait for all cache setters to settle
		});
	}


	/**
	* Fetch an issue by ID
	* This will use the cached issue if it is available
	* @param {Object} [options] Options to mutate behaviour
	* @param {Boolean} [options.guess=true] Try to guess the optimal page to pull if the issue is not already in cache
	* @param {Number} [options.fuzzBefore=10] (if `guessPage`) How many records before guessed possition to seek
	* @param {Number} [options.fuzzAfter=10] (if `guessPage`) How many records after guessed possition to seek
	* @param {Object} [options.cache] cache.worker() options
	* @returns {Promise<Object>} The fetched issue
	*/
	get(id, options) {
		let settings = {
			guess: false, // FIXME: Doesn't work as FC doesn't return issues in any logical order
			fuzzBefore: 10,
			fuzzAfter: 10,
			cache: {
				enabled: false,
				id,
				expiry: '30m',
				...options?.cache,
			},
		};

		return this.cache.worker(settings.cache, ()=> Promise.resolve()
			.then(()=> debug(`Issue "${id}" not in cache, refreshing cache...`))
			// Guess logic {{
			.then(()=> {
				if (!settings.guess) return {};
				let {numeric: guessOffset} = /(?<numeric>\d{4,})$/.exec(id)?.groups || {};
				if (!guessOffset) {
					debug('Cannot guess issue offset from "${id}"');
					return;
				}
				guessOffset = parseInt(guessOffset);
				guessOffset -= 1000; // All FC issues start at 1000

				debug(`Guessing offset ${guessOffset - settings.fuzzBefore} - ${guessOffset + settings.fuzzAfter} contains issue "${id}"`);
				return {
					offset: guessOffset - settings.fuzzBefore,
					limit: settings.fuzzAfter,
				};
			})
			// }}}
			.then(fetchParams => this.fetchAll({
				cache: settings.cache,
				...fetchParams,
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
