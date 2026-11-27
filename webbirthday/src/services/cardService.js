import axios from "../utils/axiosCustomize.js";

const API_URL = "api/cards";

export const getCards = (params, signal) => {
  return axios.get(API_URL, { params, signal });
};
export const getCardById = (id) => axios.get(`${API_URL}/${id}`);
export const createCard = (data) => axios.post(API_URL, data);
export const updateCard = (id, data) => axios.put(`${API_URL}/${id}`, data);
export const deleteCard = (id) => axios.delete(`${API_URL}/${id}`);
// nếu sau này có thêm create/update/delete thì viết tiếp ở đây
