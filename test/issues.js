import {expect} from 'chai';
import FCAuth from '#lib/auth';
import FCIssues from '#lib/issues';
import config from './config.js';
import mlog from 'mocha-logger';

describe('FeedCamp.Issues', function() {
	this.timeout(60 * 1000); //=~ 60s

	let fcAuth, fcIssues;

	before('setup auth', ()=> {
		fcAuth = new FCAuth(config);
	});

	before('init auth', ()=>
		fcAuth.init()
			.then(()=> mlog.log('Auth completed'))
	);

	before('setup issues instance', ()=> {
		fcIssues = new FCIssues({auth: fcAuth});
		fcIssues.includeRaw = true;
	});

	before('clear cache', ()=>
		fcIssues.cache.clear()
			.then(()=> mlog.log('Cache cleared'))
	);

	before(()=> mlog.log('Start fetch'))

	let issues;
	it('fetch all issues (primary project only)', ()=> Promise.resolve()
		.then(()=> fcIssues.fetchAll({
			onFetchPage(pageNumber) {
				mlog.log('Fetching page', pageNumber);
			},
			onProgress(issueCount) {
				mlog.log('Fetched', issueCount, 'issues');
			},
		}))
		.then(res => {
			mlog.log('Fetched', res.length, 'project issues');
			issues = res;
			expect(issues).to.be.an('array');
			expect(issues).to.have.length.above(10);
		})
	);

	it('issues conform to FCIssue spec', ()=> {
		issues.forEach(issue => {
			expect(issue).to.be.an('object');
			expect(issue).to.have.property('id');
			expect(issue.id).to.be.a('string');
			expect(issue).to.have.property('project');
			expect(issue.project).to.be.a('string');
			expect(issue).to.have.property('ref');
			expect(issue.ref).to.be.a('string');
			expect(issue.ref).to.match(/\d{4,}$/);
			expect(issue).to.have.property('title');
			expect(issue.title).to.be.a('string');
			expect(issue).to.have.property('assignee');
			expect(issue.assignee).to.be.a('string');
			expect(issue).to.have.property('status');
			expect(issue.status).to.be.a('string');
			expect(issue).to.have.property('url');
			expect(issue.url).to.be.a('string');
			expect(issue.url).to.match(/^https:\/\/freedcamp.com\/view\/\d+\/issuetracker\/\d+\/?$/);
			expect(issue).to.have.property('html');
			expect(issue.html).to.be.a('string');
			expect(issue).to.have.property('raw');
			expect(issue.raw).to.be.an('object');
		});
	});

	it('retrieve random issues', ()=> Promise.resolve()
		.then(()=> Promise.all([
			fcIssues.get(issues[1].ref),
			fcIssues.get(issues[5].ref),
			fcIssues.get(issues[10].ref),
		]))
		.then(issues => {
			issues.forEach(i => {
				expect(i).to.have.property('id');
				expect(i).to.have.property('ref');
			});
		})
	)

	it('should retrieve one issue after cache purge (primary project only)', ()=> Promise.resolve()
		.then(()=> fcIssues.cache.clear())
		.then(()=> fcIssues.get(config.testIssueRef))
		.then(res => {
			expect(res).to.have.property('ref', config.testIssueRef);
		})
	);

	it('should retrieve one issue + its comments', ()=> Promise.resolve()
		.then(()=> fcIssues.get(config.testIssueRef, {comments: true}))
		.then(res => {
			expect(res).to.have.property('ref', config.testIssueRef);
			expect(res).to.have.property('comments');
			expect(res.comments).to.be.an('array');
			res.comments.forEach(comment => {
				expect(comment).to.have.property('id');
				expect(comment.id).to.be.a('string');
				expect(comment).to.have.property('created');
				expect(comment.created).to.be.a('number');
				// Omitted edited as its optional
				expect(comment).to.have.property('user');
				expect(comment.user).to.be.a('string');
				expect(comment).to.have.property('url');
				expect(comment.url).to.be.a('string');
				expect(comment.url).to.match(/^https:\/\/freedcamp.com\/view\/\d+\/issuetracker\/\d+\//);
				expect(comment).to.have.property('html');
				expect(comment.html).to.be.a('string');
				expect(comment).to.have.property('raw');
				expect(comment.raw).to.be.an('object');
			});
		})
	);

	it('should retrieve random issues after cache purge', ()=> Promise.resolve()
		.then(()=> fcIssues.cache.clear())
		.then(()=> Promise.all([
			fcIssues.get(issues[10].ref),
			fcIssues.get(issues[20].ref),
			fcIssues.get(issues[30].ref),
		]))
		.then(res => {
			expect(res[0]).to.deep.equal(issues[10]);
			expect(res[1]).to.deep.equal(issues[20]);
			expect(res[2]).to.deep.equal(issues[30]);
		})
	);

	it('should retrieve one issue after cache purge (global)', ()=> Promise.resolve()
		.then(()=> fcIssues.cache.clear())
		.then(()=> fcIssues.get(config.testGlobalIssueRef, {global: true}))
		.then(res => {
			expect(res).to.have.property('ref', config.testGlobalIssueRef);
		})
	);

	// Skipped as the fetched issue list can be hudge
	it.skip('fetch all issues (global)', ()=> Promise.resolve()
		.then(()=> fcIssues.fetchAll({
			force: true,
			global: true,
			onFetchPage(pageNumber) {
				mlog.log('Fetching page', pageNumber);
			},
			onProgress(issueCount) {
				mlog.log('Fetched', issueCount, 'issues');
			},
		}))
		.then(res => {
			mlog.log('Fetched', res.length, 'global issues');
			expect(res).to.be.an('array');
			if (issues) expect(res).to.have.length.above(issues);

			expect(res).to.satisfy(r => r.some(i => i.ref == config.testIssueRef), 'Has the primary project issue we are looking for');
			expect(res).to.satisfy(r => r.some(i => i.ref == config.testGlobalIssueRef), 'Has the global issue we are looking for');
		})
	);

});
