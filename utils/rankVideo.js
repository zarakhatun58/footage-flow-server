// utils/rankVideo.js
export const calculateRankScore = ({ likes, shares, views }) => {
  // Example: Weighted score (feel free to tweak)
  return (likes * 2) + (shares * 3) + (views * 1);
};
