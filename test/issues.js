import {expect} from 'chai';
import FCAuth from '#lib/auth';
import FCIssues from '#lib/issues';

// TEST CONFIG ----------------------
const testIssueId = 'AEMO1020';
// ----------------------------------

describe('FeedCamp.Issues', function() {
	this.timeout(60 * 1000); //=~ 60s

	let fcAuth, fcIssues;

	before('setup auth', ()=> {
		fcAuth = new FCAuth();
	});

	before('init auth', ()=>
		fcAuth.init()
	);

	before('setup issues instance', ()=> {
		fcIssues = new FCIssues({auth: fcAuth});
	});

	before('clear cache', ()=>
		fcIssues.cache.clear()
	);

	let issues;
	it('fetch all issues', ()=> Promise.resolve()
		.then(()=> fcIssues.fetchAll())
		.then(res => {
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

	it('should retrieve one issue after cache purge', ()=> Promise.resolve()
		.then(()=> fcIssues.cache.clear())
		.then(()=> fcIssues.get(testIssueId))
		.then(res => {
			expect(res).to.have.property('ref', testIssueId);
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

});
