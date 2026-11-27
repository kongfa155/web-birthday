import axios from "../utils/axiosCustomize.js";

const API_URL = "/api/users";

export const getUsers = async () => {
  const res = await axios.get(API_URL);
  return res.data;
};

export const updateUserStatus = async (id, isActive) => {
  const res = await axios.put(`${API_URL}/${id}`, { isActive });
  return res.data.user;
};

export const postCreateNewUser = async (payload) => {
  return await axios.post(API_URL, payload);
};

export const loginUser = (credentials) => {
  return axios.post(`${API_URL}/login`, credentials);
};

export const registerUser = (userData) => {
  return axios.post(`${API_URL}/register`, userData);
};

export const getCurrentUser = () => {
  return axios.get(`${API_URL}/me`);
};

export const getGoogleChallenge = () => {
  return axios.post(`${API_URL}/google/challenge`, {}, { withCredentials: true });
};

export const loginWithGoogle = (credentialPayload) => {
  const payload =
    typeof credentialPayload === "string"
      ? { credential: credentialPayload }
      : credentialPayload;
  return axios.post(`${API_URL}/google`, payload, { withCredentials: true });
};
