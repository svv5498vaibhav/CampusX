import { matchedData } from 'express-validator';
import { sendSuccess } from '../utils/apiResponse.js';
import * as commentService from '../services/commentService.js';

export async function updateComment(req, res) {
  res.set('Cache-Control', 'no-store');
  const { content } = matchedData(req, { locations: ['body'] });
  const comment = await commentService.updateComment(req.params.commentId, req.user, content);
  return sendSuccess(res, { message: 'Comment updated', data: { comment } });
}

export async function deleteComment(req, res) {
  const data = await commentService.deleteComment(req.params.commentId, req.user);
  return sendSuccess(res, { message: 'Comment deleted', data });
}
