// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/extend-expect';

// No test should reach the network. The app pings the server as it starts up to
// wake it, so rendering it in a test would otherwise fire a real request at
// whichever server the build points at, on every run. A test that needs a
// particular response can still override this with its own.
beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      // Signed out unless a test says otherwise. The app asks who the player is
      // before it shows anything, so this has to answer, and json() has to exist
      // or that first call throws instead of resolving.
      status: 401,
      json: () => Promise.resolve({ signedIn: false }),
      text: () => Promise.resolve(''),
    })
  );
});
