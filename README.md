# Github Code Review Analytics
A simple node app that you can run to get analytics on code reviewers for any github repo.

### How to run
1. `git clone https://github.com/fredells/review-scanner.git`
2. `cd review-scanner`
3. `brew install node`
4. `npm install`
5. `npm install --save-dev typescript`
6. Hardcode your `repoOwner`, `repoName`, `endpoint`, `userAuthToken` values in `app.ts`
7. `npx tsc && node dist/app.js`

### Output
<img width="600" src="https://user-images.githubusercontent.com/16091920/161437683-66ad43bc-ca59-47dd-bec6-9222ea551859.png" />

