import { matchedData } from 'express-validator';
import ApiError from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as commentService from '../services/commentService.js';
import * as postService from '../services/postService.js';
import * as reportService from '../services/reportService.js';

// Feed data is personal (likes, saves, ownership): never cache it.
const noStore = (res) => res.set('Cache-Control', 'no-store');
const bodyOf = (req) => matchedData(req, { locations: ['body'] });
const queryOf = (req) => matchedData(req, { locations: ['query'] });

export function getOptions(req, res) {
  res.set('Cache-Control', 'private, max-age=300');
  return sendSuccess(res, { message: 'Post options', data: postService.getPostOptions() });
}

export async function listPosts(req, res) {
  noStore(res);
  const data = await postService.listFeed(req.user, queryOf(req));
  return sendSuccess(res, { message: 'Campus feed', data });
}

export async function getPost(req, res) {
  noStore(res);
  const post = await postService.getPost(req.params.postId, req.user);
  return sendSuccess(res, { message: 'Post', data: { post } });
}

export async function createPost(req, res) {
  noStore(res);
  const post = await postService.createPost(req.user, bodyOf(req), req.files ?? []);
  return sendSuccess(res, { statusCode: 201, message: 'Posted to CampusX!', data: { post } });
}

/** Runs before any upload is read, so only the author's files ever reach the disk. */
export async function requirePostOwner(req, res, next) {
  await postService.loadOwnPost(req.params.postId, req.user);
  return next();
}

export async function updatePost(req, res) {
  const changes = bodyOf(req);
  const files = req.files ?? [];
  if (Object.keys(changes).length === 0 && files.length === 0) {
    throw ApiError.unprocessable('There is nothing to update.');
  }
  noStore(res);
  const post = await postService.updatePost(req.params.postId, req.user, changes, files);
  return sendSuccess(res, { message: 'Post updated.', data: { post } });
}

export async function deletePost(req, res) {
  const data = await postService.deletePost(req.params.postId, req.user);
  return sendSuccess(res, { message: 'Post deleted.', data });
}

const membership = (set, value, message) => async (req, res) => {
  noStore(res);
  const data = await set(req.params.postId, req.user, value);
  return sendSuccess(res, { message, data });
};

export const likePost = membership(postService.setLike, true, 'Post liked');
export const unlikePost = membership(postService.setLike, false, 'Like removed');
export const savePost = membership(postService.setSave, true, 'Post saved');
export const unsavePost = membership(postService.setSave, false, 'Post removed from saved');

export async function reportPost(req, res) {
  await reportService.createLegacyReport(req.user, { family: 'post', targetType: 'post', targetId: req.params.postId, ...bodyOf(req) }, { duplicate: postService.ALREADY_REPORTED, own: "You can't report your own post.", notFound: postService.POST_NOT_FOUND });
  return sendSuccess(res, { statusCode: 201, message: 'Thanks. Your report has been submitted.' });
}

export async function listComments(req, res) {
  noStore(res);
  const data = await commentService.listComments(req.params.postId, req.user, queryOf(req));
  return sendSuccess(res, { message: 'Comments', data });
}

export async function addComment(req, res) {
  noStore(res);
  const data = await commentService.addComment(req.params.postId, req.user, bodyOf(req).content);
  return sendSuccess(res, { statusCode: 201, message: 'Comment added', data });
}
