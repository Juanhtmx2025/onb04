const axios = require('axios');
module.exports = {
    getPiCsv(data) {
        return axios.post(process.env.API_PI_URL + "&csv_headers=true", data, {
            auth: {
                username: process.env.API_PI_USER,
                password: process.env.PERSONALITY_INSIGHTS_IAM_APIKEY,
            },
            headers: {
                "Content-Type": "text/plain;charset=utf-8",
                "Accept": "text/csv",
                'Content-Language': "es",
                'Accept-Language':  "es",
            },
        })
        .then(function (response) {
           return response.data;
        });
    },
    getPiJson(data) {
        // IBM NLU (Natural language understanding)
        return axios.get(process.env.API_PI_URL, {
            auth: {
                username: process.env.API_PI_USER,
                password: process.env.API_PI_PASS,
            },
            headers: {
                "Content-Type": "text/plain;charset=utf-8",
                "Accept": "application/json",
                'Content-Language': "es",
                'Accept-Language':  "es",
            },
            params: {
                version: (process.env.API_PI_VERSION || '2021-08-01'),
                text: data,
                features: 'keywords,entities',
                'entities.emotion': true,
                'entities.sentiment': true,
                'keywords.emotion': true,
                'keywords.sentiment': true
            }
        })
        .then(function (response) {
           return response.data;
        });
    },
};