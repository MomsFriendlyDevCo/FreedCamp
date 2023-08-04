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
* @property {String} html HTML body of the issue
* @property {Object} raw The raw, original issue object (only provided if `FCIssues.includeRaw` is truthy)
*
* @property {Array<Object>} comments Optional comment stream (available via `FCIssues.get(ref, {comments: true})`)
* @property {String} comments.id The FC comment ID
* @property {Number} comments.created The original creation date of the comment in JavaScript Unix epoc
* @property {Number} [comments.edited] Comment last updated (or omitted if not)
* @property {String} comments.user The name of the poster
* @property {String} comments.url Direct link to the comment
* @property {String} comments.html HTML body of the comment
* @property {String} comments.raw The raw, original comment object (only provided if `FCIssues.includeRaw` is truthy)
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
	* Whether to also extract the `raw` entry per issue for debugging purposes
	* @type {Boolean}
	*/
	includeRaw = false;


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
				html: issue.description,
				url: issue.url,
				...(this.includeRaw && {raw: issue}),
				...(issue.comments && {comments: issue.comments.map(c => ({ // Tidy up comments
					id: c.id,
					created: c.created_ts * 1000,
					...(c.created_ts != c.updated_ts && {edited: c.updated_ts * 1000}),
					user: c.user_full_name,
					url: c.url,
					html: c.description_processed,
					...(this.includeRaw && {raw: c}),
				}))}),
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
	* @param {Function} [options.onFetchPage] Function to call as `(pageNumber)` before requesting a page of results, count is from zero
	* @param {Function} [options.onRequest] Function to call as `(axiosRequest)` before each Axios request
	* @param {Function} [options.onProgress] Function to call as `(issueCount)` when issues are pulled in
	* @returns {Promise<Array>} A collection representing all fetched issues
	*/
	fetchAll(options) {
		let settings = {
			force: false,
			offset: -1,
			limit: 100,
			onFetchPage(pageNumber) {}, // eslint-disable-line no-unused-vars
			onProgress(issueCount) {}, // eslint-disable-line no-unused-vars
			onRequest(axiosRequest) {}, // eslint-disable-line no-unused-vars
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
						.then(()=> settings.onFetchPage(page))
						.then(()=> this.auth.getAxiosPrototype({
							method: 'GET',
							url: '/issues',
							params: {
								limit: settings.limit,
								offset: settings.offset > -1
									? settings.offset
									: settings.limit * page,
							},
						}))
						.then(request => Promise.resolve(settings.onRequest(request))
							.then(()=> request)
						)
						.then(request => axios(request))
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
		});
	}


	/**
	* Fetch an issue by its ref (e.g. `ABC-1234`)
	* This will use the cached issue if it is available
	* @param {Object} [options] Options to mutate behaviour
	* @param {Boolean} [options.comments=false] Also fetch associated comment collection
	* @param {Object} [options.cache] cache.worker() options
	* @returns {Promise<Object>} The fetched issue
	*/
	get(ref, options) {
		debug('Get', ref);
		let settings = {
			comments: false,
			...options,
		};

		return Promise.resolve()
			.then(()=> this.cache.worker({
				id: `issues/${ref}`,
				expiry: this.cacheConfig.fetchExpiry,
			}, ()=> Promise.resolve()
				.then(()=> debug(`Issue "${ref}" not in cache, refreshing cache...`))
				// Can we jump direct to its ID? {{{
				.then(()=> this.cache.get(`linkages/byRef/issues/${ref}`))
				.then(fcId => {
					// Use ID to fetch single issue
					if (fcId) {
						debug(`Issue "${ref}" has internal linkage to "${fcId}" - making request for that`);
						return axios(this.auth.getAxiosPrototype({
							method: 'GET',
							url: `/issues/${fcId}`,
						}))
							.then(({data}) => {
								if (data.data.issues.length != 1) throw new Error(`Expected FCIssues to return 1 issue got ${data.issues.length}`);
								return data.data.issues[0];
							})
							.then(issue => this.injectIssue(issue))
					} else { // Make full refresh request
						debug(`Search for ref "${ref}"`);
						return axios(this.auth.getAxiosPrototype({
							method: 'GET',
							url: `/issues`,
							params: {
								substring: ref,
							},
						}))
							.then(({data}) => {
								if (data.data.issues.length != 1) throw new Error(`Expected FCIssues to return 1 issue got ${data.issues.length}`);
								return data.data.issues[0];
							})
							.then(issue => this.injectIssue(issue))
					}
				})
				// }}}
			))
			// Optionally fetch comments if they are not already present {{{
			.then(item => {
				if (!settings.comments || item.comments) return item; // Not wanting comments OR we already have them

				debug(`Need full comment stream for item "${ref}", fetching`);
				return axios(this.auth.getAxiosPrototype({
					method: 'GET',
					url: `/issues/${item.id}`,
				}))
					.then(({data}) => {
						if (data.data.issues.length != 1) throw new Error(`Expected FCIssues to return 1 issue got ${data.issues.length}`);
						return data.data.issues[0];
					})
					.then(issue => this.injectIssue(issue))
			})
			// }}}
	}
}
