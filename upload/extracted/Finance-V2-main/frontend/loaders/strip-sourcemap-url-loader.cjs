module.exports = function stripSourcemapUrlLoader(source) {
  if (typeof source !== "string") return source;
  return source.replace(/\/\/# sourceMappingURL=.*$/gm, "");
};
