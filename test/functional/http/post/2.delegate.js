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

		function stripTransactionsResults (results) {
			strippedResults = {
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
		}

		function postDelegate (params) {
			return sendTransactionPromise(node.lisk.delegate.createDelegate(params.secret, params.username));
		}

		function enrichRandomAccount () {
			account = node.randomAccount();
			validParams = {
				secret: account.password,
				username: account.username
			};
			return creditAccountPromise(account.address, 4 * constants.fees.delegate).then(function (res) {
				node.expect(res).to.have.property('success').to.be.ok;
				node.expect(res).to.have.property('transactionId');
				node.expect(res.transactionId).to.be.not.empty;
				return waitForConfirmations([res.transactionId]);
			});
		}

		var getDelayedRegistration = function (delay) {
			return function () {
				return new node.Promise(function (res, rej) {
					setTimeout(function () {
						postDelegate(validParams).then(res).catch(rej);
					}, delay);
				});
			};
		};

		var sendTwiceAndConfirm = function (sendSecond) {
			return node.Promise.all([
				postDelegate(validParams),
				sendSecond()
			]).then(function (results) {
				node.expect(results).to.have.nested.property('0.transactionId');
				node.expect(results).to.have.nested.property('0.success');
				node.expect(results).to.have.nested.property('1.transactionId');
				node.expect(results).to.have.nested.property('1.success');
				firstTransactionId = results[0].transactionId;
				secondTransactionId = results[1].transactionId;
				return waitForConfirmations([firstTransactionId, secondTransactionId]).then(stripTransactionsResults);
			});
		};

		describe('using same account', function () {

			describe('using same username', function () {

				describe('with the same id', function () {

					var firstResponse;
					var secondResponse;

					before(function () {
						return enrichRandomAccount().then(function () {
							return node.Promise.all([
								postDelegate(validParams),
								postDelegate(validParams)
							]).then(function (results) {
								firstResponse = results[0];
								secondResponse = results[1];
							});
						});
					});

					it('first transaction should be ok', function () {
						node.expect(firstResponse).to.have.property('transactionId').to.be.a('string');
					});

					it('second transaction should fail', function () {
						node.expect(secondResponse).to.have.property('message').equal('Transaction is already processed: ' + firstResponse.transactionId);
					});
				});

				describe('with different timestamp', function () {

					before(function () {
						return enrichRandomAccount()
							.then(sendTwiceAndConfirm(getDelayedRegistration(1001))
								.then(postDelegate(validParams)));
					});

					it('should not confirm one transaction', function () {
						node.expect(strippedResults.successFields).to.contain(false);
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

				before(function () {
					return enrichRandomAccount()
						.then(function () {
							differentUsernameParams = {
								secret: account.password,
								username: node.randomUsername()
							};
							return sendTwiceAndConfirm(function () {
								return postDelegate(differentUsernameParams);
							});
						});
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

			var enrichSecondRandomAccount = function () {
				secondAccount = node.randomAccount();
				secondAccountValidParams = {
					secret: secondAccount.password,
					username: secondAccount.username
				};
				return creditAccountPromise(secondAccount.address, 4 * constants.fees.delegate).then(function (res) {
					node.expect(res).to.have.property('success').to.be.ok;
					node.expect(res).to.have.property('transactionId');
					node.expect(res.transactionId).to.be.not.empty;
					return waitForConfirmations([res.transactionId]);
				});
			};

			before(function () {
				return enrichSecondRandomAccount().then(enrichRandomAccount);
			});

			describe('using same username', function () {

				before(function () {
					secondAccountValidParams.username = validParams.username;
					return sendTwiceAndConfirm(function () {
						return postDelegate(secondAccountValidParams);
					});
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

				before(function () {
					return enrichSecondRandomAccount().then(enrichRandomAccount);
				});

				before(function () {
					return sendTwiceAndConfirm(function () {
						return postDelegate(secondAccountValidParams);
					});
				});

				it('should successfully confirm both transactions', function () {
					node.expect(strippedResults.successFields).eql([true, true]);
					node.expect(strippedResults.transactionsIds).to.have.lengthOf(2);
				});
			});
		});
	});
});
