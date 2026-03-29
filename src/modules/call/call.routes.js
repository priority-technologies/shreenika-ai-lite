'use strict';

const express = require('express');
const {
  listCalls,
  getCall,
  updateCall,
  archiveCall,
  redialCall,
  getCallStats,
} = require('./call.controller.js');

const router = express.Router();

// Stats (must come before /:id to avoid param capture)
router.get('/stats',        getCallStats);

// CRUD
router.get('/',             listCalls);
router.get('/:id',          getCall);
router.put('/:id',          updateCall);

// Actions
router.post('/:id/archive', archiveCall);
router.post('/:id/redial',  redialCall);

module.exports = router;
