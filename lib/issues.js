import axios from 'axios';
import Debug from 'debug';

const debug = Debug('freedcamp');


/**
* An individual Freedcamp Issue
* @type {Object}
* @property {String} id The FC ID of the issue
* @property {String} ref The human readable reference
* @property {String} title The issue title
* @property {String} assignee The name of the person assigned
* @property {String} status The status title of the issue
* @property {String} url The URL of the issue
* @property {Object} raw The raw, original issue object
*/



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
	* Caching config
	* @type {Object}
	* @param {Object} [options.cacheFetchExpiry='30m'] How often to allow fetchAll to run
	* @param {Object} [options.cacheIssueExpiry='30m'] Individual issue caching expiry
	* @param {Object} [options.cacheIssueLinkageExpiry] Issue linkage expiry - its recommended to leave this as null as it should be immutable
	*/
	cacheConfig = {
		fetchExpiry: '30m',
		issueExpiry: '30m',
		issueLinkageExpiry: null,
	};


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
	* Take a raw FC issue, tidy it up and add all relevent caching entries
	* @param {Object} issue Raw FC issue to tidy up
	* @returns {Object} An issue in the FCIssueItem spec
	*/
	injectIssue(issue) {
		return Promise.resolve()
			.then(()=> ({
				id: issue.id,
				ref:  issue.number_prefixed,
				title: issue.title,
				assignee: issue.assigned_to_fullname,
				status: issue.status_title,
				priority: issue.priority_title,
				url: issue.url,
				raw: issue,
			}))
			.then(fcIssue => Promise.all([
				// Header meta information for the issue
				this.cache.set(`issues/${fcIssue.ref}`, fcIssue, this.cacheConfig.issueExpiry),

				// Linkage info (ref -> id)
				this.cache.set(`linkages/byRef/issues/${fcIssue.ref}`, fcIssue.id, this.cacheConfig.issueLinkageExpiry),

				// Linkage info (id -> ref)
				this.cache.set(`linkages/byId/issues/${fcIssue.id}`, fcIssue.ref, this.cacheConfig.issueLinkageExpiry),
			]).then(()=> fcIssue))
	}


	/**
	* Fetch all issues and optionally cache for future reference
	* This function uses caching by default unless `options.cache.enabled=false`
	* @param {Object} [options] Options to mutate behaviour
	* @param {Boolean} [options.force=false] Whether to force the search, even if caching is present
	* @param {Number} [options.limit=100] How many issues to pull down at once
	* @param {Number} [options.offset=-1] Overriding offset to start pulling from, will pull once only and ignore page calculations, use `-1` to disable
	* @returns {Promise<Array>} A collection representing all fetched issues
	*/
	fetchAll(options) {
		let settings = {
			force: false,
			offset: -1,
			limit: 100,
			...options,
		};

		if (!this.auth) throw new Error('Auth not setup');

		return this.cache.worker({
			id: 'workers/issues/fetchAll',
			expiry: this.cacheConfig.fetchExpiry,
			enabled: !settings.force,
		}, ()=> {
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
								this.injectIssue(issue)
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
				.then(giveBack => {
					console.log('TAP GIVEBACK:', giveBack);
					return giveBack;
				})
		});
	}


	/**
	* Fetch an issue by ID
	* This will use the cached issue if it is available
	* @param {Object} [options] Options to mutate behaviour
	* @param {Boolean} [options.guess=true] Try to guess the optimal offset to pull if the issue is not already in cache
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
			...options,
		};

		return this.cache.worker({
			id: `issues/${id}`,
			expiry: this.cacheConfig.fetchExpiry,
		}, ()=> Promise.resolve()
			.then(()=> debug(`Issue "${id}" not in cache, refreshing cache...`))
			// Can we jump direct to its ID? {{{
			.then(()=> this.cache.get(`linkages/byRef/issues/${id}`))
			.then(fcId => {
				// Use ID to fetch single issue
				if (fcId) {
					return axios(this.auth.getAxiosPrototype({
						method: 'GET',
						url: '/issues/${fcId}',
					}))
						.then(issue => this.tidyIssue(issue))
				} else if (settings.guess) {
					// Guess logic {{{
					let {numeric: guessOffset} = /(?<numeric>\d{4,})$/.exec(id)?.groups || {};
					if (!guessOffset) {
						debug('Cannot guess issue offset from "${id}"');
						return;
					}
					guessOffset = parseInt(guessOffset);
					guessOffset -= 1000; // All FC issues start at 1000

					debug(`Guessing offset ${guessOffset - settings.fuzzBefore} - ${guessOffset + settings.fuzzAfter} contains issue "${id}"`);
					return this.fetchAll({
						force: true,
						cache: settings.cache,
						offset: guessOffset - settings.fuzzBefore,
						limit: settings.fuzzAfter,
					});
					// }}}
				} else { // Make full refresh request
					return this.fetchAll({
						force: true,
					});
				}
			})
			// }}}
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
