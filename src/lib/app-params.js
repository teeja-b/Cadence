// The login token lives in localStorage. It's read once at startup because
// login and logout always reload the page.
export const TOKEN_KEY = "access_token";

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const appParams = {
  token: readToken(),
};
