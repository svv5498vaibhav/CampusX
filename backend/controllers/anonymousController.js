import { matchedData } from 'express-validator';
import ApiError from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as commentService from '../services/anonymousCommentService.js';
import * as reportService from '../services/anonymousReportService.js';
import * as anonymousService from '../services/anonymousService.js';

// Anonymous content depends on who is asking (ownership, likes, visibility): never cache it.
const noStore = (res) => res.set('Cache-Control', 'no-store');
const bodyOf = (req) => matchedData(req, { locations: ['body'] });
const queryOf = (req) => matchedData(req, { locations: ['query'] });

export function getOptions(req, res) {
  res.set('Cache-Control', 'private, max-age=300');
  return sendSuccess(res, { message: 'Anonymous Zone options', data: anonymousService.getAnonymousOptions() });
}

export async function listPosts(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Anonymous posts', data: await anonymousService.listAnonymousPosts(req.user, queryOf(req)) });
}

export async function listMine(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Your anonymous posts', data: await anonymousService.listMyAnonymousPosts(req.user, queryOf(req)) });
}

export async function getPost(req, res) {
  noStore(res);
  const post = await anonymousService.getAnonymousPost(req.params.postId, req.user);
  return sendSuccess(res, { message: 'Anonymous post', data: { post } });
}

export async function createPost(req, res) {
  noStore(res);
  const post = await anonymousService.createAnonymousPost(req.user, bodyOf(req), req.files ?? []);
  return sendSuccess(res, { statusCode: 201, message: 'Posted anonymously.', data: { post } });
}

export async function updatePost(req, res) {
  const changes = bodyOf(req);
  if (Object.keys(changes).length === 0) throw ApiError.unprocessable('There is nothing to update.');
  noStore(res);
  const post = await anonymousService.updateAnonymousPost(req.params.postId, req.user, changes);
  return sendSuccess(res, { message: 'Post updated.', data: { post } });
}

export async function deletePost(req, res) {
  return sendSuccess(res, { message: 'Anonymous post deleted.', data: await anonymousService.deleteAnonymousPost(req.params.postId, req.user) });
}

export async function likePost(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Liked', data: await anonymousService.setLike(req.params.postId, req.user, true) });
}

export async function unlikePost(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Like removed', data: await anonymousService.setLike(req.params.postId, req.user, false) });
}

export async function reportPost(req, res) {
  await reportService.reportAnonymousPost(req.params.postId, req.user, bodyOf(req));
  return sendSuccess(res, { statusCode: 201, message: 'Thanks. Your report has been submitted.' });
}

// ----------------------------------------------------------------------------- comments

export async function listComments(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Comments', data: await commentService.listComments(req.params.postId, req.user, queryOf(req)) });
}

export async function addComment(req, res) {
  noStore(res);
  const data = await commentService.addComment(req.params.postId, req.user, bodyOf(req).content);
  return sendSuccess(res, { statusCode: 201, message: 'Comment added.', data });
}

export async function updateComment(req, res) {
  noStore(res);
  const comment = await commentService.updateComment(req.params.commentId, req.user, bodyOf(req).content);
  return sendSuccess(res, { message: 'Comment updated.', data: { comment } });
}

export async function deleteComment(req, res) {
  return sendSuccess(res, { message: 'Comment deleted.', data: await commentService.deleteComment(req.params.commentId, req.user) });
}

export async function reportComment(req, res) {
  await reportService.reportAnonymousComment(req.params.commentId, req.user, bodyOf(req));
  return sendSuccess(res, { statusCode: 201, message: 'Thanks. Your report has been submitted.' });
}
