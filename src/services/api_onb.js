const axios = require('axios');
module.exports = {
    getToken() {
        return axios.get(process.env.API_ONB_URL + "ODataAuthentication", {
                auth: {
                    username: process.env.API_ONB_USER,
                    password: process.env.API_ONB_PASSWORD,
                },
            })
            .then(function (response) {
                return response.data;
            })
            .catch(error => {
                return error.response;
            });
    },
    getHrDataId(token, filter) {
        return axios.get(process.env.API_ONB_URL + "HRData" + filter, {
                headers: {
                    'Authorization': token
                },
            })
            .then(function (response) {
                return response;
            })
            .catch(error => {
                return error.response;
            });
    },
    storeAttachment(token, data) {
        return axios.post(process.env.API_ONB_URL + "OnboardeeAttachment", data, {
                headers: {
                    'Authorization': token
                },
            })
            .then(function (response) {
                return response;
            })
            .catch(error => {
                return error.response;
            });;
    },
    putAnswers(token, data) {
        return axios.put(process.env.API_ONB_URL + "HRData", data, {
                headers: {
                    'Authorization': token
                },
            })
            .then(function (response) {
                return response;
            })
            .catch(error => {
                return error.response;
            });
    }
};