const express = require("express");
require("dotenv");
// micro provides http helpers
const { createError, json, send } = require("micro");
// microrouter provides http server routing
//const { router, get, post } = require('microrouter');
// serve-handler serves static assets
const staticHandler = require("serve-handler");
// async-retry will retry failed API requests
const retry = require("async-retry");

// logger gives us insight into what's happening
const logger = require("./controller/logger");
// schema validates incoming requests
//const { validatePaymentPayload } = require('./controller/schema');
// square provides the API client and error types
const { ApiError, client: square } = require("./controller/square");
const { nanoid } = require("nanoid");

const app = express();
const PORT = process.env.PORT || 7000;

async function createPayment(req, res) {
	const payload = await json(req);
	logger.debug(JSON.stringify(payload));
	// We validate the payload for specific fields. You may disable this feature
	// if you would prefer to handle payload validation on your own.
	// if (!validatePaymentPayload(payload)) {
	// 	throw createError(400, "Bad Request");
	// }
	await retry(async (bail, attempt) => {
		try {
			logger.debug("Creating payment", { attempt });

			const idempotencyKey = payload.idempotencyKey || nanoid();
			const amount = payload.amount * 100;
			const payment = {
				idempotencyKey,
				locationId: payload.locationId,
				sourceId: payload.sourceId,
				// While it's tempting to pass this data from the client
				// Doing so allows bad actor to modify these values
				// Instead, leverage Orders to create an order on the server
				// and pass the Order ID to createPayment rather than raw amounts
				// See Orders documentation: https://developer.squareup.com/docs/orders-api/what-it-does
				amountMoney: {
					// the expected amount is in cents, meaning this is $1.00.
					amount,
					// If you are a non-US account, you must change the currency to match the country in which
					// you are accepting the payment.
					currency: "USD",
				},
			};

			// VerificationDetails is part of Secure Card Authentication.
			// This part of the payload is highly recommended (and required for some countries)
			// for 'unauthenticated' payment methods like Cards.
			if (payload.verificationToken) {
				payment.verificationToken = payload.verificationToken;
			}

			const { result, statusCode } = await square.paymentsApi.createPayment(payment);

			logger.info("Payment succeeded!", { result, statusCode });
			//return { result, statusCode };
			send(res, statusCode, {
				success: true,
				payment: {
					id: result.payment.id,
					status: result.payment.status,
					receiptUrl: result.payment.receiptUrl,
					orderId: result.payment.orderId,
				},
			});
		} catch (ex) {
			if (ex instanceof ApiError) {
				// likely an error in the request. don't retry
				logger.error(ex.errors);
				bail(ex);
			} else {
				// IDEA: send to error reporting service
				logger.error(`Error creating payment on attempt ${attempt}: ${ex}`);
				throw ex; // to attempt retry
			}
		}
	});
}

async function serveStatic(req, res) {
	logger.debug("Handling request", req.path);
	await staticHandler(req, res, {
		public: "public",
	});
}

// app.get("/", (req, res) => {
// 	return res.status(200).json({ message: "Welcome to payment test" });
// });

app.post("/payment", createPayment);

app.get("/", serveStatic);

app.listen(PORT, () => {
	console.log(`I am running again on port ${PORT}`);
});
