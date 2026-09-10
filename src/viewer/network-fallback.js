const nativeFetch = window.fetch.bind(window);

window.fetch = async function resilientPdfFetch(input, init) {
  const request = new Request(input, init);

  try {
    return await nativeFetch(request);
  } catch (error) {
    const url = new URL(request.url);
    const isRemotePdfRequest =
      (request.method === "GET" || request.method === "HEAD") &&
      (url.protocol === "http:" || url.protocol === "https:");

    if (!isRemotePdfRequest || request.credentials !== "include") {
      throw error;
    }

    const retryRequest = new Request(request, { credentials: "omit" });
    return nativeFetch(retryRequest);
  }
};
