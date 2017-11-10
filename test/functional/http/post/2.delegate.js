'use strict';

var node = require('../../../node');
var shared = require('../../shared');
var constants = require('../../../../helpers/constants');

var sendTransactionPromise = require('../../../common/apiHelpers').sendTransactionPromise;
var creditAccountPromise = require('../../../common/apiHelpers').creditAccountPromise;
var waitForConfirmations = require('../../../common/apiHelpers').waitForConfirmations;

describe('POST /api/transactions (type 2) register delegate', function () {

	var transaction;
	var transactionsToWaitFor = [];
	var badTransactions = [];
	var goodTransactions = [];
	var badTransactionsEnforcement = [];
	var goodTransactionsEnforcement = [];

	var account = node.randomAccount();
	var accountNoFunds = node.randomAccount();
	var accountMinimalFunds = node.randomAccount();
	var accountUpperCase = node.randomAccount();
	var accountFormerDelegate = node.randomAccount();

	// Crediting accounts
	before(function () {

		var promises = [];
		promises.push(creditAccountPromise(account.address, 1000 * node.normalizer ));
		promises.push(creditAccountPromise(accountMinimalFunds.address, constants.fees.delegate));
		promises.push(creditAccountPromise(accountUpperCase.address, constants.fees.delegate));
		promises.push(creditAccountPromise(accountFormerDelegate.address, constants.fees.delegate));

		return node.Promise.all(promises)
			.then(function (results) {
				results.forEach(function (res) {
					node.expect(res).to.have.property('success').to.be.ok;
					node.expect(res).to.have.property('transactionId').that.is.not.empty;
					transactionsToWaitFor.push(res.transactionId);
				});
			})
			.then(function (res) {
				return waitForConfirmations(transactionsToWaitFor);
			});
	});

	describe('schema validations', function () {

		shared.invalidAssets(account, 'delegate', badTransactions);
	});

	describe('transactions processing', function () {

		it('with no funds should fail', function () {
			transaction = node.lisk.delegate.createDelegate(accountNoFunds.password, accountNoFunds.username);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('success').to.not.be.ok;
				node.expect(res).to.have.property('message').to.equal('Account does not have enough LSK: ' + accountNoFunds.address + ' balance: 0');
				badTransactions.push(transaction);
			});
		});

		it('with minimal required amount of funds should be ok', function () {
			transaction = node.lisk.delegate.createDelegate(accountMinimalFunds.password, accountMinimalFunds.username);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('success').to.be.ok;
				node.expect(res).to.have.property('transactionId').to.equal(transaction.id);
				goodTransactions.push(transaction);
			});
		});

		it('using blank username should fail', function () {
			transaction = node.lisk.delegate.createDelegate(account.password, '');

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('success').to.be.not.ok;
				node.expect(res).to.have.property('message').to.equal('Username is undefined');
				badTransactions.push(transaction);
			});
		});

		it('using invalid username should fail', function () {
			var username = '~!@#$ %^&*()_+.,?/';
			transaction = node.lisk.delegate.createDelegate(account.password, username);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('success').to.be.not.ok;
				node.expect(res).to.have.property('message').to.equal('Invalid transaction body - Failed to validate delegate schema: Object didn\'t pass validation for format username: ' + username);
				badTransactions.push(transaction);
			});
		});

		it('using username longer than 20 characters should fail', function () {
			var username = node.randomString.generate({
				length: 20+1,
				charset: 'alphabetic',
				capitalization: 'lowercase'
			});

			transaction = node.lisk.delegate.createDelegate(account.password, username);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('success').to.be.not.ok;
				node.expect(res).to.have.property('message').to.equal('Username is too long. Maximum is 20 characters');
				badTransactions.push(transaction);
			});
		});

		it('using uppercase username should fail', function () {
			transaction = node.lisk.delegate.createDelegate(accountUpperCase.password, accountUpperCase.username.toUpperCase());

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('success').to.be.not.ok;
				node.expect(res).to.have.property('message').to.equal('Username must be lowercase');
				badTransactions.push(transaction);
			});
		});

		it('using valid params should be ok', function () {
			transaction = node.lisk.delegate.createDelegate(account.password, account.username);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('success').to.be.ok;
				node.expect(res).to.have.property('transactionId').to.equal(transaction.id);
				goodTransactions.push(transaction);
			});
		});
	});

	describe('confirmation', function () {

		shared.confirmationPhase(goodTransactions, badTransactions);
	});

	describe('validation', function () {

		it('setting same delegate twice should fail', function () {
			transaction = node.lisk.delegate.createDelegate(account.password, account.username);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('success').to.not.be.ok;
				node.expect(res).to.have.property('message').to.equal('Account is already a delegate');
				badTransactionsEnforcement.push(transaction);
			});
		});

		it('using existing username should fail', function () {
			transaction = node.lisk.delegate.createDelegate(accountFormerDelegate.password, account.username);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('success').to.not.be.ok;
				node.expect(res).to.have.property('message').to.equal('Username already exists');
				badTransactionsEnforcement.push(transaction);
			});
		});

		it('updating registered delegate should fail', function () {
			transaction = node.lisk.delegate.createDelegate(account.password, 'newusername');

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('success').to.not.be.ok;
				node.expect(res).to.have.property('message').to.equal('Account is already a delegate');
				badTransactionsEnforcement.push(transaction);
			});
		});
	});

	describe('confirm validation', function () {

		shared.confirmationPhase(goodTransactionsEnforcement, badTransactionsEnforcement);
	});

	describe('double registration', function () {

		var strippedResults;
		var firstTransactionId;
		var secondTransactionId;
		var validParams;

		var stripTransactionsResults = function (results) {
			return {
				successFields:results.map(function (res) {
					return res.body.success;
				}),
				errorFields: results.map(function (res) {
					return res.body.error;
				}).filter(function (error) {
					return error;
				}),
				transactionsIds: results.map(function (res) {
					return res.body.transaction;
				}).filter(function (trs) {
					return trs;
				}).map(function (trs) {
					return trs.id;
				})
			};
		};
		function postDelegate (params, done) {
			transaction = node.lisk.delegate.createDelegate(params.secret, params.username);
			return sendTransactionPromise(transaction).then(function (res) {
				done(res.body);
			});
		}

		function sendLISK (params, done) {
			transaction = node.lisk.delegate.createDelegate(params.secret, params.username);
			return creditAccountPromise(accountFormerDelegate.address, constants.fees.delegate).then(done);
		}

		function enrichRandomAccount (cb) {
			account = node.randomAccount();
			validParams = {
				secret: account.password,
				username: account.username
			};
			sendLISK({
				secret: node.gAccount.password,
				amount: node.LISK,
				recipientId: account.address
			}, function (err, res) {
				node.expect(res.body).to.have.property('success').to.be.ok;
				node.expect(res.body).to.have.property('transactionId');
				node.expect(res.body.transactionId).to.be.not.empty;
				node.onNewBlock(cb);
			});
		}

		var sendTwice = function (sendSecond, cb) {
			node.async.series({
				first: function (cb) {
					return postDelegate(validParams, cb);
				},
				second: sendSecond
			}, function (err, res) {
				node.expect(res).to.have.deep.property('first.body.success').to.be.true;
				node.expect(res).to.have.deep.property('second.body.success').to.be.true;
				firstTransactionId = res.first.body.transaction.id;
				secondTransactionId = res.second.body.transaction.id;
				cb();
			});
		};

		var getConfirmations = function (cb) {
			return function () {
				node.onNewBlock(function () {
					node.async.series([
						function (cb) {
							return node.get('/api/transactions/get?id=' + firstTransactionId, cb);
						},
						function (cb) {
							return node.get('/api/transactions/get?id=' + secondTransactionId, cb);
						}
					], function (err, results) {
						strippedResults = stripTransactionsResults(results);
						cb();
					});
				});
			};
		};

		describe('using same account', function () {

			describe('using same username', function () {

				describe('with the same id', function () {

					var firstResponse;
					var secondResponse;

					before(enrichRandomAccount);

					before(function (done) {
						node.async.series({
							first: function (cb) {
								return postDelegate(validParams, cb);
							},
							second: function (cb) {
								return postDelegate(validParams, cb);
							}
						}, function (err, res) {
							if (err) {
								return done(err);
							}
							firstResponse = res.first.body;
							secondResponse = res.second.body;
							done();
						});
					});

					it('first transaction should be ok', function () {
						node.expect(firstResponse).to.have.property('transaction');
					});

					it('second transaction should fail', function () {
						node.expect(secondResponse).to.have.property('error').equal('Transaction is already processed: ' + firstResponse.transaction.id);
					});
				});

				describe('with different timestamp', function () {

					before(enrichRandomAccount);

					before(function (done) {
						sendTwice(function (cb) {
							setTimeout(function () {
								return postDelegate(validParams, cb);
							}, 1001);
						}, getConfirmations(done));
					});

					it('should not confirm one transaction', function () {
						node.expect(strippedResults.successFields).to.contain(false);
						node.expect(strippedResults.errorFields).to.have.lengthOf(1).and.to.contain('Transaction not found');
					});

					it('should confirm one transaction', function () {
						node.expect(strippedResults.successFields).to.contain(true);
						node.expect(strippedResults.transactionsIds).to.have.lengthOf(1);
						node.expect([firstTransactionId, secondTransactionId]).and.to.contain(strippedResults.transactionsIds[0]);
					});
				});
			});

			describe('with different usernames', function () {

				var differentUsernameParams;

				before(enrichRandomAccount);

				before(function (done) {
					differentUsernameParams = {
						secret: account.password,
						username: node.randomUsername()
					};
					sendTwice(function (cb) {
						return postDelegate(differentUsernameParams, cb);
					}, getConfirmations(done));
				});

				it('should not confirm one transaction', function () {
					node.expect(strippedResults.successFields).to.contain(false);
					node.expect(strippedResults.errorFields).to.have.lengthOf(1).and.to.contain('Transaction not found');
				});

				it('should confirm one transaction', function () {
					node.expect(strippedResults.successFields).to.contain(true);
					node.expect(strippedResults.transactionsIds).to.have.lengthOf(1);
					node.expect([firstTransactionId, secondTransactionId]).and.to.contain(strippedResults.transactionsIds[0]);
				});
			});
		});

		describe('using two different accounts', function () {

			var secondAccount;
			var secondAccountValidParams;

			var enrichSecondRandomAccount = function (cb) {
				secondAccount = node.randomAccount();
				secondAccountValidParams = {
					secret: secondAccount.password,
					username: secondAccount.username
				};
				sendLISK({
					secret: node.gAccount.password,
					amount: node.LISK,
					recipientId: secondAccount.address
				}, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.ok;
					node.expect(res.body).to.have.property('transactionId');
					node.expect(res.body.transactionId).to.be.not.empty;
					cb();
				});
			};

			before(function (done) {
				enrichSecondRandomAccount(function () {
					enrichRandomAccount(done);
				});
			});

			describe('using same username', function () {

				before(function (done) {
					secondAccountValidParams.username = validParams.username;
					sendTwice(function (cb) {
						return postDelegate(secondAccountValidParams, cb);
					}, getConfirmations(done));
				});

				it('should not confirm one transaction', function () {
					node.expect(strippedResults.successFields).to.contain(false);
					node.expect(strippedResults.errorFields).to.have.lengthOf(1).and.to.contain('Transaction not found');
				});

				it('should confirm one transaction', function () {
					node.expect(strippedResults.successFields).to.contain(true);
					node.expect(strippedResults.transactionsIds).to.have.lengthOf(1);
					node.expect([firstTransactionId, secondTransactionId]).and.to.contain(strippedResults.transactionsIds[0]);
				});
			});

			describe('using different usernames', function () {

				var firstConfirmedTransaction;
				var secondConfirmedTransaction;

				before(function (done) {
					enrichSecondRandomAccount(function () {
						enrichRandomAccount(done);
					});
				});

				before(function (done) {
					sendTwice(function (cb) {
						return postDelegate(secondAccountValidParams, cb);
					}, function () {
						node.onNewBlock(function () {
							node.async.series({
								firstConfirmedTransaction: function (cb) {
									return node.get('/api/transactions/get?id=' + firstTransactionId, cb);
								},
								secondConfirmedTransaction: function (cb) {
									return node.get('/api/transactions/get?id=' + secondTransactionId, cb);
								}
							}, function (err, res) {
								firstConfirmedTransaction = res.firstConfirmedTransaction.body;
								secondConfirmedTransaction = res.secondConfirmedTransaction.body;
								done();
							});
						});
					});
				});

				it('should successfully confirm both transactions', function () {
					node.expect(firstConfirmedTransaction).to.have.deep.property('success').to.be.true;
					node.expect(firstConfirmedTransaction).to.have.deep.property('transaction.id').to.be.equal(firstTransactionId);
					node.expect(secondConfirmedTransaction).to.have.deep.property('success').to.be.true;
					node.expect(secondConfirmedTransaction).to.have.deep.property('transaction.id').to.be.equal(secondTransactionId);
				});
			});
		});
	});

});
