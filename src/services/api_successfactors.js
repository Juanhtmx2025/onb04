const axios = require('axios');
module.exports = {
    getPersonIdExt(filter) {
        var api_url = process.env.API_SUCCESSF_URL + "PerPerson?$format=json&$expand=personalInfoNav&$select=personIdExternal,personalInfoNav/displayName&$filter=";
        return axios.get(api_url + filter, {
                auth: {
                    username: process.env.API_SUCCESSF_USER,
                    password: process.env.API_SUCCESSF_PASSWORD,
                }
            })
            .then(function (response) {
                return response;
            })
            .catch(error => {
                return error.response;
            });
    },
    getOnbKeys(external_code) {
        var api_url = process.env.API_SUCCESSF_URL + "cust_Claves_ONB?$format=json&$filter=externalCode eq '" + external_code + "'";
        return axios.get(api_url, {
                auth: {
                    username: process.env.API_SUCCESSF_USER,
                    password: process.env.API_SUCCESSF_PASSWORD,
                }
            })
            .then(function (response) {
                return response;
            })
            .catch(error => {
                return error.response;
            });
    },
    storeAttachment(data) {
        return axios.post(process.env.API_SUCCESSF_URL + "upsert", data, {
                auth: {
                    username: process.env.API_SUCCESSF_USER,
                    password: process.env.API_SUCCESSF_PASSWORD,
                },
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                    "Accept": "application/json"
                }
            })
            .then(function (response) {
                return response;
            })
            .catch(error => {
                return error.response;
            });;
    },  
    storeAnswers(data) {
        return axios.post(process.env.API_SUCCESSF_URL + "upsert", data, {
                auth: {
                    username: process.env.API_SUCCESSF_USER,
                    password: process.env.API_SUCCESSF_PASSWORD,
                },
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                    "Accept": "application/json"
                }
            })
            .then(function (response) {
                return response;
            })
            .catch(error => {
                return error.response;
            });
    }
};