import { gql, GraphQLClient } from 'graphql-request'
import { ReviewsQuery, Team, User } from './generated/graphql'
import { plot, Plot } from 'nodeplotlib';

// set these variables

// normal github repo use: 'https://api.github.com/graphql
// enterprise repo use: 'https://github.YOURORG.net/api/graphql'
const graphqlEndpoint = ""

// owner and repo name that appears in the url for your repo: 'https://github.com/OWNER/REPO'
const repoOwner = ""
const repoName = ""

// visit 'https://github.com/settings/tokens' and create a personal access token with REPO rights
const userAuthToken = ""

function queryString(cursor: string = null): string {
    return gql`
    {
        repository(owner: "${repoOwner}", name: "${repoName}") {
        pullRequests(first: 50, after: ${cursor}, orderBy: {field: CREATED_AT, direction: DESC}, states: [MERGED]) {
          pageInfo {
            startCursor
            endCursor
            hasNextPage
          }
          edges {
            node {
              number
              title
              createdAt
              mergedAt
              additions
              deletions
              reviewRequests(first: 50) {
                edges {
                  node {
                    asCodeOwner
                    requestedReviewer {
                      ... on Team {
                        slug
                        members(first: 50) {
                          edges {
                            node {
                              login
                            }
                          }
                        }
                      }
                      ... on User {
                        login
                      }
                    }
                  }
                }
              }
              reviews(first: 50) {
                edges {
                  node {
                    publishedAt
                    state
                    author {
                      ... on User {
                        login
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }    
    `
}

type PrTimeData = { additions: number, timeFirstReview: number, timeMerged: number }

const graphQLClient = new GraphQLClient(graphqlEndpoint, {
    headers: {
        authorization: `Bearer ${userAuthToken}`,
    },
})

var userReviewRequests: Map<string, number> = new Map();
var teamReviewRequests: Map<string, number> = new Map();
var userReviews: Map<string, number> = new Map();
var userReviewsDiff: Map<string, number> = new Map();
var prTimeData: Array<PrTimeData> = []

var oneMonthAgo = new Date(
    new Date().getFullYear(),
    new Date().getMonth() - 1,
    new Date().getDate()
)

var counter = 0
var reachedDateThreshold: Boolean = false

async function main() {
    console.log("Scanning merged PRs created in the last month")
    console.log("- Pulling first 50 PRs")
    var cursor = null
    while (!reachedDateThreshold) {
        await graphQLClient.request<ReviewsQuery>(queryString(cursor))
            .then(response => {
                var result = response as ReviewsQuery
                result.repository?.pullRequests?.edges?.map(pr => {
                    var creationDate = new Date(Date.parse(pr.node?.createdAt))

                    if (creationDate > oneMonthAgo) {
                        counter++
                    } else {
                        reachedDateThreshold = true
                        console.log("PR is older than one month")
                        return
                    }


                    pr.node?.reviewRequests?.edges?.map(edge => {
                        // if user
                        if (edge.node?.requestedReviewer as User !== undefined) {
                            var user = edge.node?.requestedReviewer as User
                            if (user.login !== undefined) {
                                if (userReviewRequests.get(user.login) == null) {
                                    userReviewRequests.set(user.login, 1)
                                } else {
                                    userReviewRequests.set(user.login, userReviewRequests.get(user.login) + 1)
                                }
                            }
                        }
                        // if team
                        if (edge.node?.requestedReviewer as Team !== undefined) {
                            var team = edge.node?.requestedReviewer as Team
                            if (team.slug !== undefined) {
                                if (teamReviewRequests.get(team.slug) == null) {
                                    teamReviewRequests.set(team.slug, 1)
                                } else {
                                    teamReviewRequests.set(team.slug, teamReviewRequests.get(team.slug) + 1)
                                }
                            }
                        }
                    })
                    // check reviews submitted
                    var distinct: Array<string> = []
                    pr.node?.reviews?.edges?.map(edge => {
                        var login = (edge.node?.author as User).login
                        if (login !== undefined && login != "service-danger-systems") {
                            if (distinct.indexOf(login) == -1) {
                                if (userReviews.get(login) == null) {
                                    userReviews.set(login, 1)
                                } else {
                                    userReviews.set(login, userReviews.get(login) + 1)
                                }
                                var additions = pr.node?.additions
                                if (additions == null) { additions = 0 }
                                if (userReviewsDiff.get(login) == null) {
                                    userReviewsDiff.set(login, additions)
                                } else {
                                    userReviewsDiff.set(login, userReviewsDiff.get(login) + additions)
                                }
                                distinct.push(login)
                            }
                        }
                    })

                    // check to time first review
                    var numReviews = pr.node?.reviews?.edges?.length
                    if (numReviews != null && numReviews > 0) {
                        var additions = pr.node.additions
                        var createdAt = Date.parse(pr.node.createdAt)
                        var firstReviewAt = Date.parse(pr.node?.reviews?.edges[0].node?.publishedAt)
                        var timeMerged = Date.parse(pr.node?.mergedAt)
                        prTimeData.push({ additions: additions, timeFirstReview: firstReviewAt - createdAt, timeMerged: timeMerged - createdAt })
                    }
                })
                cursor = "\"" + result.repository?.pullRequests?.pageInfo.endCursor + "\""

                var len = result.repository?.pullRequests.edges?.length
                var lastDate = new Date(Date.parse(result.repository?.pullRequests.edges[len - 1].node?.createdAt))
                console.log(`-- Looked back to ${lastDate}`)
                console.log("- Pulling 50 more PRs")
            })
    }

    // draw the graphs
    // reviews by person
    plot([
        {
            x: [...userReviewRequests.keys()],
            y: [...userReviewRequests.values()],
            type: 'bar',
            name: 'Review requested',
        },
        {
            x: [...userReviews.keys()],
            y: [...userReviews.values()],
            type: 'bar',
            name: 'Review given'
        },
        {
            x: [...userReviewsDiff.keys()],
            y: [...userReviewsDiff.values()].map(it => Math.log(it)),
            type: 'bar',
            name: 'Additions reviewed (Log)',
        }
    ])

    // team review requests
    plot([
        {
            x: [...teamReviewRequests.keys()],
            y: [...teamReviewRequests.values()],
            type: 'bar',
            name: 'Team review requests',
            title: {
                text: 'Team review requests',
            }
        }
    ])

    var prTimeDataTrace1: Plot = {
        x: prTimeData.map(item => item.timeFirstReview / 3600000 / 24),
        y: prTimeData.map(item => Math.log(item.additions)),
        mode: 'markers',
        type: 'scatter',
        name: 'Days until first reviewed'
    }

    var prTimeDataTrace2: Plot = {
        x: prTimeData.map(item => item.timeMerged / 3600000 / 24),
        y: prTimeData.map(item => Math.log(item.additions)),
        mode: 'markers',
        type: 'scatter',
        name: 'Days until merged'
    }

    // time to get reviews & merge
    plot([
        prTimeDataTrace1,
        prTimeDataTrace2,
    ], {
        title: {
            text: 'Time to first review & merge',
        },
        xaxis: {
            title: 'Days'
        },
        yaxis: {
            title: 'PR additions (Log)'
        },
    })
}

main();