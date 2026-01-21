import express from 'express';
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');


// swagger.js

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'API Gestión de Neumáticos',
            version: '1.0.0',
            description: 'Documentación del backend del sistema de gestión de neumáticos',
        },
        servers: [
            {
                url: 'http://localhost:3001/api',
            },
        ],
    },
    apis: ['./routes/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = {
    swaggerUi,
    swaggerSpec,
};