var Airtable = require('airtable')
var express = require('express')
var randomstring = require("randomstring")
var bodyParser = require("body-parser")

var app = express()
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}))

app.listen(process.env.PORT || 3000, () => {
    console.log("ABSL is up and running.")
})

require('dotenv').config()

var base = new Airtable({
    apiKey: process.env.AIRTABLE_KEY
}).base(process.env.AIRTABLE_BASE)

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
    
    if (auth != process.env.API_KEY)
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
                            status: 200
                        })
                    }
                });
            }
        }
    )
})

// not api: fetch URL and redirect
app.get('/*', (req, res) => {
    var slug = req.path.substring(1)

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
