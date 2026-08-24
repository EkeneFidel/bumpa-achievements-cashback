## Bumpa Backend Assessment


### Stack

- NestJS - TypeScript
- Postgres
- Redis
- BullMQ
- Korapay as local payment provider 

## Getting started

You need a `.env` file, copy the example and fill in the blanks:

```bash
cp .env.example .env
```

- `JWT_SECRET` - Any random string
- `KORAPAY_SECRET_KEY` - Get secret key from korapay dashboard

Run:

```bash
docker compose up --build
```

The app will be running on `http://localhost:3000`


## Running tests

```bash
npm test            # unit tests
npm run test:integration  # integration tests
```

## API Documentation

The endpoints are documented [here](https://api-docs.hoppscotch.io/view/b42382d6-7b6a-4547-b8a0-3c8013f4b994/CURRENT)

## Design choices

> [!NOTE]
> While the assessment criteria specifies a 300 Naira cashback value, the Korapay API enforces a minimum transfer of 1,000 Naira. Consequently, a value of 3,000 Naira was used for verification and testing purposes.

- **Scale:** this is one store, not a platform with thousands of stores.
  Here I assumed a low number of users and purchases a day.

- **Architecture: monolith architecture.** One app, one database, one
  server. Microservices only start paying off once different parts of the system need to scale separately or be owned by different teams. 

- **Postgres Database:** the data is relational, a user has purchases, purchases unlock achievements, achievements belong to groups, groups unlock badges, badges trigger a payment. All of that is connected data, and money is involved.

- **Redis:** it's used to hold a lock to ensure achievements are checked once and also used to store cashback queue jobs

- **A purchase is all or nothing.** When someone buys something, the app locks their account row and the product row, checks stock and balance, then updates both and saves the purchase together. If anything goes wrong, none of it saves. This is what stops two people from both buying the last item in stock at the same time.

- **Achievements and badges are checked in the background, not during the purchase request.** Once a purchase is saved, the app fires off a
  `PURCHASE_RECORDED_EVENT`. A listener picks that up and
  checks if the user just unlocked an achievement, and if a badge should come with it. This keeps the purchase response fast, since the customer isn't stuck waiting on achievement checks before they get a response.

- **A short lock stops the same user's achievements from being checked twice at once.** 
  If two purchases from the same user land at almost the same time, this stops both of them from trying to unlock the same
  achievement at the same moment.

- **Cashback uses a safety-net pattern so a payment is never lost.** When a badge is unlocked, the app saves the badge and an outbox event record in the database. So even if the app crashes right after the badge is saved, the outbox record is still there and the payment still goes out later. A background job checks for this record and sends the actual payment.

- **The payment provider can be swapped out.** The rest of the app doesn't talk to Korapay directly, it talks to a generic payment interface. Korapay is the only one plugged in right now, but switching to a different provider later means adding one new file, not rewriting the payment logic.