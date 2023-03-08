import {expect} from 'chai';
import FCAuth from '#lib/auth';
import FCIssues from '#lib/issues';

// TEST CONFIG ----------------------
const testIssueId = 'AEMO1078';
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

	let issues;
	it('fetch all issues', ()=> Promise.resolve()
		.then(()=> fcIssues.fetchAll())
		.then(res => {
			issues = res;
			expect(issues).to.be.an('array');
			expect(issues).to.have.length.above(10);
		})
	);

	it('retrieve random issues', ()=> Promise.resolve()
		.then(()=> Promise.all([
			fcIssues.get(issues[100].id),
			fcIssues.get(issues[200].id),
			fcIssues.get(issues[200].id),
		]))
		.then((...issues) => {
			issues.forEach(i => {
				expect(i).to.have.property('id');
			});
		})
	)

	it.only('should retrieve one issue after cache purge', ()=> Promise.resolve()
		.then(()=> fcIssues.cache.clear())
		.then(()=> fcIssues.get(testIssueId))
		.then((...res) => {
			expect(res[0]).to.have.property('id', testIssueId);
		})
	);

	it('should retrieve random issues after cache purge', ()=> Promise.resolve()
		.then(()=> fcIssues.cache.clear())
		.then(()=> Promise.all([
			fcIssues.get(issues[100].id),
			fcIssues.get(issues[200].id),
			fcIssues.get(issues[200].id),
		]))
		.then((...res) => {
			expect(res[0]).to.deep.equal(issues[100]);
			expect(res[1]).to.deep.equal(issues[200]);
			expect(res[2]).to.deep.equal(issues[300]);
		})
	);

});
