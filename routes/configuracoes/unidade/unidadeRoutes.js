const { Router } = require('express');
const unidadeRoutes = Router();
const { configureMulterMiddleware } = require('../../../config/uploads');

const UnidadeController = require('../../../controllers/configuracoes/unidade/unidadeController');
const unidadeController = new UnidadeController();

const route = '/unidade';

unidadeRoutes.get(`${route}`, unidadeController.getList);
unidadeRoutes.get(`${route}/:id`, unidadeController.getData);
unidadeRoutes.post(`${route}/updateData/:id`, unidadeController.updateData);
unidadeRoutes.delete(`${route}/fileReport/:id`, unidadeController.handleDeleteImage);
unidadeRoutes.delete(`${route}/:id`, unidadeController.deleteData);
unidadeRoutes.post(`${route}/new/insertData`, unidadeController.insertData);

//? MULTER: Upload de arquivo
unidadeRoutes.post(`${route}/updateData/report/:id`, (req, res, next) => {
    const isImage = 'true'
    configureMulterMiddleware(req, res, next, req.params.id, 'uploads/report', isImage);
}, unidadeController.updateDataReport);

module.exports = unidadeRoutes;