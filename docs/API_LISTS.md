# EndPoint List

1. ### _Users Endpoints_

    * [Create a new user](user-endpoints-documentation/create-new-user) `Post /signup`
    * [Signin User](user-endpoints-documentation/signin) `Post /login`
    * [Refresh Token](user-endpoints-documentation/refresh-token) `Post /refresh_token`   
    * [githubAuthValidator](user-endpoints-documentation/github signin) `Post /github`


2. ### _Claim & Node Documentation_

    * [requires a valid JWT token to be passed in the request ](Claim-&-Node-Documentation/jwtVerify) `Post /claim`
    * [GET claims](Claim-&-Node-Documentation/get-claims) `GET /claim/:claimId?`
    * [retrieves a list of nodes]( claim-node-documentiona/gets-node) `GET /node/:nodeId?`
    

### _DETAILS_

``claimPost: creates a new claim in the database using the data provided in the request body. If the request contains the necessary environment variables, it also sends the claim data to a third-party service using an HTTP POST request. Returns the created claim as a JSON response.
claimGet: retrieves a list of claims from the database, filtered by optional query parameters such as a search term or pagination limits. If a claim ID is provided in the request params, returns the single claim object with that ID. Otherwise, returns an array of claim objects and a count of the total number of claims in the database.
nodesGet: retrieves a list of nodes from the database, filtered by optional query parameters such as a search term or pagination limits. If a node ID is provided in the request params, returns the single node object with that ID and any edges connected to it. Otherwise, returns an array of node objects and a count of the total number of nodes in the database.

``