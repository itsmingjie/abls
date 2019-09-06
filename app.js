var Airtable = require('airtable')
var express = require('express')
var randomstring = require("randomstring")
var bodyParser = require("body-parser")
var auth = require('http-auth')
var isBot = require('isbot')

var app = express()
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}))

app.listen(process.env.PORT || 3000, () => {
    console.log("ABSL is up and running.")
})

var basicAuth = auth.basic({
    realm: "Admin"
}, (username, password, callback) => {
    callback(username == process.env.APP_USER && password == process.env.APP_SECRET)
})

require('dotenv').config()

var base = new Airtable({
    apiKey: process.env.AIRTABLE_KEY
}).base(process.env.AIRTABLE_BASE)

app.get('/api/', (req, res) => {
    return res.json({
        status: 200,
        message: "bleep bloop orphoos"
    })
})

// api: find destination and return JSON
app.post('/api/trace', (req, res) => {

    var slug = req.body.slug

    if (slug == undefined) {
        return res.json({
            status: 500,
            error: "Missing parameter: slug"
        })
    } else {
        lookup(slug).then(
            result => {
                return res.json({
                    status: 200,
                    destination: result
                })
            },
            error => {

                let msg = ""
                if (error == 404)
                    msg = "Invalid short URL! Please double check."
                else
                    msg = "Unhandled server exception"

                return res.json({
                    status: error,
                    error: msg
                })
            }
        )
    }
})

// api: create new redirection record / update existing record
// 0. if no slug, generate slug
// 1. if slug does not exist yet, create, return
// 2. if slug exists, dest empty, destroy, return
// 3. if slug exists, dest exists, update, return
app.post('/api/push', (req, res) => {

    var slug = req.body.slug,
        dest = req.body.dest,
        auth = req.body.auth

    if (auth != process.env.APP_SECRET)
        return res.json({
            status: 401,
            error: "Unauthorized"
        })

    if (slug == undefined && dest == undefined)
        return res.json({
            status: 500,
            error: "Missing parameter: eithre slug & dest needs to exist"
        })

    if (slug == undefined) {
        slug = randomstring.generate(6)
    }

    lookup(slug, true).then(
        result => {
            console.log(result)
            if (dest == undefined || dest == "") {
                // case #2
                base('Links').destroy(result, function (err, deletedRecord) {
                    if (err) {
                        console.log(err)
                        return res.json({
                            status: 500,
                            error: err
                        })
                    }

                    console.log("Deleted /" + slug)
                    return res.json({
                        status: 200
                    })
                });
            } else {
                base('Links').update(result, {
                    "destination": dest
                }, function (err, record) {
                    if (err) {
                        console.error(err);
                        return;
                    }

                    console.log("Updated " + slug + " => " + dest)
                    return res.json({
                        slug: slug,
                        status: 200
                    })
                });

            }

        },
        error => {
            if (error == 404) {
                // case #1
                base('Links').create({
                    "slug": slug,
                    "destination": dest
                }, function (err, record) {
                    if (err) {
                        console.log(err)
                        return res.json({
                            status: 500,
                            error: err
                        })
                    } else {
                        console.log("Created short link " + slug + " => " + dest)
                        return res.json({
                            status: 200,
                            slug: slug
                        })
                    }
                });
            }
        }
    )
})

// serve front-end
app.use('/admin', auth.connect(basicAuth), express.static(__dirname + '/public'))
app.get('/', (req, res) => {
    return res.redirect(302, process.env.ROOT_REDIRECT)
})

// not api: fetch URL and redirect
app.get('/*', (req, res) => {
    var slug = req.path.substring(1)

    if (!isBot(req.headers['user-agent']))
        logAccess(getClientIp(req), slug, req.protocol + '://' + req.get('host') + req.originalUrl)

    lookup(slug).then(
        result => {
            res.redirect(302, result)
        },
        error => {
            res.status(500).send(error)
        }
    )
})

var lookup = (slug, idOnly) => {
    return new Promise(function (resolve, reject) {

        base('Links').select({
            filterByFormula: '{slug} = "' + slug + '"'
        }).eachPage(function page(records, fetchNextPage) {
            if (records.length > 0) {
                records.forEach(function (record) {
                    if (idOnly)
                        resolve(record.getId())
                    else
                        resolve(record.get('destination'))
                });
            } else {
                fetchNextPage();
            }
        }, function done(err) {
            if (err) {
                // api jam
                console.error(err);
                reject(500)
            } else {
                // all records scanned - no match
                reject(404)
            }
        });
    });
}

function logAccess(ip, slug, url) {

    if (process.env.LOGGING == "off")
        return

    var data = {
        "Timestamp": Date.now(),
        "Client IP": ip,
        "Slug": [],
        "URL": url
    }

    lookup(slug, true).then(
        result => {
            data["Slug"][0] = result
        }
    ).finally(() => {
        base('Log').create(data, function (err, record) {
            if (err) {
                console.error(err);
                return;
            }
        });
    })
}

function getClientIp(req) {
    var ipAddress

    var forwardedIpsStr = req.header('x-forwarded-for')
    if (forwardedIpsStr) {
        var forwardedIps = forwardedIpsStr.split(',')
        ipAddress = forwardedIps[0];
    }
    if (!ipAddress) {
        ipAddress = req.connection.remoteAddress
    }
    return ipAddress
}
