const mongoose = require('mongoose');
var request = require('request');
const {response} = require("express");

const apiOptions = {
    server: 'http://localhost:3000'
};
if(process.env.NODE_ENV === 'production'){
    apiOptions.server = 'https://loc8r-api-j556.onrender.com'
}

const requestOpitons ={
    url: `${apiOptions.server}`,
    method: 'GET',
    json:{},
    qs:{
        offset: 20
    }
};
request(requestOpitons,(err, response, body) => {
    if (err) {
        console.log(err);
    } if(response.statusCode === 200){
        console.log(body);
    } else {
        console.log(response.statusCode);
    }
});

const renderHomepage = (req, res, responseBody) => {
    let message = null;
    if (!(responseBody instanceof  Array)){
        message = "API lookup error";
        responseBody = [];
    } else {
        if (!responseBody.length) {
            message = "No places found nearby";
        }
    }
    res.render('locations-list', {
        title: 'Loc8r - find a place to work with wifi',
        pageHeader: {
            title: 'Loc8r',
            strapline: 'Find places to work with wifi near you!'
        },
        sidebar:
            "Looking for wifi and a seat? Loc8r helps you find places \
      to work when out and about. Perhaps with coffee, cake or a pint? \
      Let Loc8r help you find the place you're looking for.",
        locations: responseBody,
        message
    });
};

const homelist = (req, res) => {
    const path = '/api/locations';
    const requestOptions = {
        url: `${apiOptions.server}${path}`,
        method: 'GET',
        json: {},
        qs: {
            lng: 126.964062,
            lat: 37.468769,
            maxDistance: 200000
        }
    };
    // ⬇️ 기존 콜백 전체를 아래로 교체
    request(requestOptions, (err, response = {}, body = []) => {
        if (err) return showError(req, res, 500);

        const { statusCode = 500 } = response;

        if (statusCode === 200 && Array.isArray(body)) {
            // 🔧 목록 각 아이템 가공: distance는 기존 포맷 함수로(km/m) 유지
            const locations = body.map(loc => {
               const raw = Number(loc.distance);
                return {
                    ...loc,
                    distance: Number.isFinite(raw) ? formatDistance(raw) : loc.distance
                };
            });
            return renderHomepage(req, res, locations);
        }

        // 🔧 기존 방식 그대로 상태 코드에 따라 에러 페이지 렌더
        return showError(req, res, statusCode);
    });
};

const showError = (req, res, status) => {
    let title = '';
    let content = '';
    if (status === 404) {
        title = '404, page not found';
        content = 'Oh dear. Looks like you can\'t find this page. Sorry.';
    } else {
        title = `${status}, something's gone wrong`;
        content = 'Something, somewhere, has gone just a little bit wrong.';
    }
    res.status(status);
    return res.render('generic-text', { title, content });
};


const formatDistance = (distance) => {
    let thisDistance = 0;
    let unit = 'm';
    if (distance > 1000){
        thisDistance = (distance / 1000).toFixed(1);
        unit = 'km';
    } else {
        thisDistance = Math.round(distance);
    }
    return thisDistance + unit;
};

const openingTimeScheam = new mongoose.Schema({
    days: {
        type: String,
        required: true
    },
    opening: String,
    closeing: String,
    closed: {
        type: Boolean,
        required: true
    }
});

const reviewSchema=new mongoose.Schema({
    author: String,
    rating: {
        type: Number,
        required: true,
        min: 0,
        max: 5
    },
    reviewText: String,
    createdOn: {
        type: Date,
        'default': Date.now
    }
});

const locationSchema = new mongoose.Schema({
    name: {type: String, required: true},
    address: String,
    rating: {type: Number, "default": 0, min: 0, max: 5},
    facilities: [String],

    coords: {
        type: {type: String},
        coordinates: [Number]
    },
    openingTime: [openingTimeScheam],
    reviews: [reviewSchema]
});

locationSchema.index({coords:'2dsphere'});

mongoose.models.Location || mongoose.model('Location', locationSchema);

const renderDetailPage = function (req, res, location) {
    res.render('location-info', {
        title: location.name,
        pageHeader: {
            title: location.name
        },
        sidebar: {
            context:
                "is on Loc8r because it has accessible wifi and \
                space to sit down with your laptop and get some work done.",
            callToAction:
                "If you've been and you like it - or if you don't - \
                please leave a review to help other people just like you."
        },
        location
    });
};

const getLocationInfo = (req, res, callback) => {
    const path = `/api/locations/${req.params.locationid}`;
    const requestOptions = {
        url: `${apiOptions.server}${path}`,
        method: 'GET',
        json: {}
    };
    request(
        requestOptions,
        (err, { statusCode }, body) => {
            let data = body;
            if (statusCode === 200) {
                data.coords = {
                    lng: body.coords[0],
                    lat: body.coords[1]
                };
                callback(req, res, data);
            } else {
                showError(req, res, statusCode);
            }
        }
    );
};


// app_server/controllers/locations.js
const locationInfo = (req, res) => {
    getLocationInfo(req, res,
        (req, res, responseData) => renderDetailPage(req, res, responseData)
    );
};

const rendReviewForm = function (req, res, {name}) {
    res.render('location-review-form', {
        title: `Review ${name} on Loc8r`,
        pageHeader: {title: `Review ${name}`},
        error: req.query.err
    });
};

const addReview = (req, res) => {
    getLocationInfo(req, res,
        (req, res, responseData) => rendReviewForm(req, res, responseData)
    );
};

const doAddReview = (req, res) => {
    const locationid = req.params.locationid;
    const path = `/api/locations/${locationid}/reviews`;
    const postdata = {
        author: req.body.name,
        rating: parseInt(req.body.rating, 10),
        reviewText: req.body.review
    };
    const requestOptions = {
        url: `${apiOptions.server}${path}`,
        method: 'POST',
        json: postdata
    };
    request(
        requestOptions,
        (err, response = {}, body = {}) => {
            const statusCode = response.statusCode || 500;

            if (statusCode === 201) {
                return res.redirect(`/location/${locationid}`);
            }

            // ✅ ValidationError 포맷 2종 모두 대응
            if (
                statusCode === 400 &&
                body &&
                (body.name === 'ValidationError' || body.message === 'validation failed')
            ) {
                return res.redirect(`/location/${locationid}/review/new?err=val`);
            }

            return showError(req, res, statusCode);
        }
    );
};

module.exports = {
    homelist,
    locationInfo,
    addReview,
    doAddReview

};
