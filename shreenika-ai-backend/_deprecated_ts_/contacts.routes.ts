import { Router } from 'express';
import * as controller from '../controllers/contacts.controller';
import auth from '../middlewares/auth';

const router = Router();

router.use(auth);

router.get('/', controller.listLeads);
router.post('/', controller.createLead);
router.post('/bulk', controller.bulkUploadLeads);
router.put('/:id', controller.updateLead);
router.delete('/:id', controller.deleteLead);

export default router;
