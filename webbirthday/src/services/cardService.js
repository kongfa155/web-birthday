import axios from "../utils/axiosCustomize.js";

const API_URL = "api/cards";

export const getCards = (params, signal) => {
  return axios.get(API_URL, { params, signal });
};
export const getCardById = (id) => axios.get(`${API_URL}/${id}`);
export const createCard = (data) => axios.post(API_URL, data);
export const updateCard = (id, data) => axios.put(`${API_URL}/${id}`, data);
export const deleteCard = (id) => axios.delete(`${API_URL}/${id}`);
export const getCardShareStatus = (id, signal) =>
  axios.get(`${API_URL}/${encodeURIComponent(id)}/share`, { signal });
export const createOrRotateCardShare = (id, signal) =>
  axios.post(`${API_URL}/${encodeURIComponent(id)}/share`, undefined, { signal });
export const disableCardShare = (id, signal) =>
  axios.delete(`${API_URL}/${encodeURIComponent(id)}/share`, { signal });
// nếu sau này có thêm create/update/delete thì viết tiếp ở đây
