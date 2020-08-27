import React from "react";
import UnsplashWrapper from "./unsplash_wrapper";
import propTypes from "prop-types";
import SearchIcon from "./search_icon";
import ErrorImage from "./error_image";
import SpinnerImg from "./spinner_img";
import ReactIntersectionObserver from "./react_intersection_observer";
import "intersection-observer";
import { debounce, throttle, withDefaultProps } from "./utils";
const { string, func, number, bool, object, shape, any } = propTypes;

import BlobUploader from "./uploaders/blob_uploader";
import DataTransferUploader from "./uploaders/data_transfer_uploader";
import Base64Uploader from "./uploaders/base64_uploader";
import ExternalLocationUploader from "./uploaders/external_location_uploader";
import InsertIntoApplicationUploader from "./uploaders/insert_into_application_uploader";

function noop() { }

const inputNoAppearanceStyle = {
  border: "none",
  padding: 0,
  margin: 0,
  backgroundColor: "transparent",
  boxShadow: "none",
  fontSize: "1em",
  outline: "none",
};

const inputGray = "#AAA";
const inputDarkGray = "#555";
const borderRadius = 3;

export default class UnsplashPicker extends React.Component {
  static propTypes = {
    unsplashKey: string.isRequired,
    applicationName: string.isRequired,
    columns: number,
    actionBar: any,
    defaultSearch: string,
    highlightColor: string,
    onFinishedUploading: func,
    photoRatio: number,
    preferredSize: shape({
      width: number.isRequired,
      height: number.isRequired,
    }),
    Uploader: func,
    __debug_chaosMonkey: bool,
  };

  static defaultProps = {
    columns: 3,
    defaultSearch: "",
    highlightColor: "#00adf0",
    onFinishedUploading: noop,
    photoRatio: 1.5,
    preferredSize: null,
    Uploader: Base64Uploader,
    __debug_chaosMonkey: false,
  };

  constructor(props) {
    super(props);

    this.state = {
      unsplash: null,
      photos: [],
      totalPhotosCount: null,
      isLoadingSearch: true,
      selectedPhoto: null,
      loadingPhoto: null,
      search: props.defaultSearch,
      searchResultsWidth: null,
      isAtBottomOfSearchResults: true,
      page: 1,
      error: null,
    };
  }

  componentDidMount() {
    const unsplash = new UnsplashWrapper({
      unsplashKey: this.props.unsplashKey,
      __debug_chaosMonkey: this.props.__debug_chaosMonkey,
    });

    this.setState({ unsplash });
    this.doSearch();

    this.recalculateSearchResultsWidth();

    window.addEventListener("resize", this.recalculateSearchResultsWidth);
  }

  componentDidUpdate(_prevProps, prevState) {
    const { search, page } = this.state;

    if (search !== prevState.search) {
      this.doSearch();
    }

    if (search === prevState.search && page !== prevState.page) {
      this.doSearch({ append: true });
    }
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.recalculateSearchResultsWidth);
  }

  didFinishLoadingNewSearchResults() {
    this.searchResults.scrollTop = 0;
  }

  recalculateSearchResultsWidth = throttle(50, () => {
    this.setState({
      searchResultsWidth: this.searchResults.getBoundingClientRect().width,
    });
  });

  loadDefault = ({ append = false } = {}) => {
    const page = append ? this.state.page : 1;
    this.state.unsplash
      .listPhotos(page, this.resultsPerPage)
      .then((photos) =>
        this.setState(
          (prevState) => ({
            photos: append ? prevState.photos.concat(photos) : photos,
            isLoadingSearch: false,
            totalPhotosCount: null,
            error: null,
            page,
          }),
          append ? noop : this.didFinishLoadingNewSearchResults
        )
      )
      .catch((e) =>
        this.setState({ error: e.message, isLoadingSearch: false })
      );
  };

  utmLink = (url) => {
    const { applicationName } = this.props;
    const utmParams = `utm_source=${applicationName}&utm_medium=referral`;
    return `${url}?${utmParams}`;
  };

  doImmediateSearch = ({ append } = {}) => {
    const { search, unsplash } = this.state;

    if (this.shouldShowDefault) {
      return this.loadDefault({ append });
    }

    const page = append ? this.state.page : 1;

    return unsplash
      .searchPhotos(search, this.state.page, this.resultsPerPage)
      .then((response) =>
        this.setState(
          (prevState) => ({
            totalPhotosCount: response.total,
            photos: append
              ? prevState.photos.concat(response.results)
              : response.results,
            isLoadingSearch: false,
            error: null,
            page,
          }),
          append ? noop : this.didFinishLoadingNewSearchResults
        )
      )
      .catch((e) =>
        this.setState({ error: e.message, isLoadingSearch: false })
      );
  };

  doDebouncedSearch = debounce(400, this.doImmediateSearch);

  doSearch = ({ append = false } = {}) => {
    this.setState({ isLoadingSearch: true });

    if (append) {
      this.doImmediateSearch({ append });
    } else {
      this.doDebouncedSearch();
    }
  };

  downloadPhoto = (photo) => {
    this.setState({ loadingPhoto: photo });
    const { preferredSize } = this.props;
    const download = this.state.unsplash.downloadPhoto(photo);

    const downloadPromise = preferredSize
      ? this.state.unsplash
        .getPhoto(photo.id, preferredSize)
        .then((r) => r.urls.custom)
      : download.then((r) => r.url);

    return downloadPromise
      .then(fetch)
      .catch((e) =>
        this.setState({ error: e.message, isLoadingSearch: false })
      );
  };

  handleSearchChange = (e) => {
    this.setState({ search: e.target.value });
  };

  handleSearchWrapperClick = () => {
    this.searchInput && this.searchInput.focus();
  };

  handlePhotoClick = (photo) => {
    this.setState({ selectedPhoto: photo });
  };

  handleFinishedUploading = (response) => {
    this.setState({ loadingPhoto: null });
    this.props.onFinishedUploading(response);
  };

  handleSearchResultsBottomIntersectionChange = (isAtBottomOfSearchResults) => {
    this.setState({ isAtBottomOfSearchResults });

    if (
      isAtBottomOfSearchResults &&
      !this.state.isLoadingSearch &&
      this.hasMoreResults
    ) {
      this.setState(({ page }) => ({ page: page + 1 }));
    }
  };

  get shouldShowDefault() {
    return this.state.search === "";
  }

  get resultsPerPage() {
    return this.props.columns * 4;
  }

  get totalResults() {
    return this.shouldShowDefault ? Infinity : this.state.totalPhotosCount;
  }

  get hasMoreResults() {
    return this.totalResults > this.resultsPerPage * this.state.page;
  }

  render() {
    const {
      Uploader,
      columns: searchResultColumns,
      photoRatio,
      highlightColor,
      actionBar,
    } = this.props;
    const {
      photos,
      search,
      selectedPhoto,
      loadingPhoto,
      totalPhotosCount,
      isLoadingSearch,
      isAtBottomOfSearchResults,
      searchResultsWidth,
      error,
    } = this.state;

    const searchResultWidth = searchResultsWidth
      ? Math.floor(searchResultsWidth / searchResultColumns)
      : 100;
    const searchResultHeight = searchResultWidth / photoRatio;

    return (
      <ReactIntersectionObserver
        onIntersectionChange={this.recalculateSearchResultsWidth}
        style={{ flexDirection: "column" }}
        className="unsplash-react d-f h-f p-0"
      >
        <CSSStyles />
        {actionBar && (
          <span
            style={{
              color: inputGray,
              fontSize: 12,
              textAlign: "center",
              display: "flex",
              justifyContent: "space-between",
              height: "34px",
              alignItems: "center",
              padding: "0 6px",
            }}
          >
            {actionBar}
          </span>
        )}
        <div
          className="d-f"
          style={{
            padding: ".5em",
            border: `1px solid #DFDFDF`,
            cursor: "text",
            borderRadius: "3px",
            fontSize: 13,
            margin: "0 6px",
          }}
          onClick={this.handleSearchWrapperClick}
        >
          <SearchInputIcon
            isLoading={isLoadingSearch}
            hasError={!!error}
            style={{ marginRight: ".5em" }}
          />
          <input
            type="text"
            value={search}
            placeholder="Search Unsplash photos by topics or colors"
            onChange={this.handleSearchChange}
            style={inputNoAppearanceStyle}
            className="f-1"
            ref={(input) => (this.searchInput = input)}
          />
          {totalPhotosCount !== null && (
            <span style={{ color: inputDarkGray }}>
              {totalPhotosCount} results
            </span>
          )}
        </div>

        <div className="p-r f-1 border-radius" style={{ overflow: "hidden" }}>
          <div
            className="h-f"
            style={{ overflowY: "scroll" }}
            ref={(element) => (this.searchResults = element)}
          >
            {error ? (
              <div
                style={{
                  textAlign: "center",
                  marginTop: "3em",
                  padding: "0 1em",
                  fontSize: 13,
                }}
              >
                <ErrorImage />
                <p>
                  We're having trouble communicating with Unsplash right now.
                  Please try again.
                </p>
                <p style={{ color: inputGray }}>{error}</p>
              </div>
            ) : (
                [
                  photos.map((photo, index) => (
                    <Photo
                      key={photo.id}
                      photo={photo}
                      index={index}
                      width={searchResultWidth}
                      height={searchResultHeight}
                      columns={searchResultColumns}
                      loadingPhoto={loadingPhoto}
                      selectedPhoto={selectedPhoto}
                      onPhotoClick={this.handlePhotoClick}
                      highlightColor={highlightColor}
                      utmLink={this.utmLink}
                    />
                  )),

                  this.searchResults && (
                    <ReactIntersectionObserver
                      key="intersectionObserver"
                      root={this.searchResults}
                      onIntersectionChange={
                        this.handleSearchResultsBottomIntersectionChange
                      }
                      style={{
                        width: "100%",
                        textAlign: "center",
                        marginTop: this.hasMoreResults ? "2em" : ".5em",
                        height: this.hasMoreResults ? 50 : 1,
                      }}
                    >
                      {this.hasMoreResults && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="44"
                          height="44"
                          viewBox="0 0 44 44"
                          stroke="#fff"
                        >
                          <g fill="none" fillRule="evenodd" strokeWidth="2">
                            <circle cx="22" cy="22" r="14.2114">
                              <animate
                                attributeName="r"
                                begin="0s"
                                dur="1.8s"
                                values="1; 20"
                                calcMode="spline"
                                keyTimes="0; 1"
                                keySplines="0.165, 0.84, 0.44, 1"
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="stroke-opacity"
                                begin="0s"
                                dur="1.8s"
                                values="1; 0"
                                calcMode="spline"
                                keyTimes="0; 1"
                                keySplines="0.3, 0.61, 0.355, 1"
                                repeatCount="indefinite"
                              />
                            </circle>
                            <circle cx="22" cy="22" r="19.7145">
                              <animate
                                attributeName="r"
                                begin="-0.9s"
                                dur="1.8s"
                                values="1; 20"
                                calcMode="spline"
                                keyTimes="0; 1"
                                keySplines="0.165, 0.84, 0.44, 1"
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="stroke-opacity"
                                begin="-0.9s"
                                dur="1.8s"
                                values="1; 0"
                                calcMode="spline"
                                keyTimes="0; 1"
                                keySplines="0.3, 0.61, 0.355, 1"
                                repeatCount="indefinite"
                              />
                            </circle>
                          </g>
                        </svg>
                      )}
                    </ReactIntersectionObserver>
                  ),
                ]
              )}
          </div>
        </div>

        <Uploader
          unsplashPhoto={selectedPhoto}
          downloadPhoto={this.downloadPhoto}
          onFinishedUploading={this.handleFinishedUploading}
        />
      </ReactIntersectionObserver>
    );
  }
}

export {
  Base64Uploader,
  ExternalLocationUploader,
  DataTransferUploader,
  BlobUploader,
  InsertIntoApplicationUploader,
  withDefaultProps,
};

function CSSStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
        .unsplash-react, .unsplash-react * { box-sizing: border-box }
        .unsplash-react input::placeholder {
          color: ${inputGray};
          opacity: 1;
        }
        @keyframes unsplash-react-fadein {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .unsplash-react .p-r { position: relative; }
        .unsplash-react .p-a { position: absolute; }

        .unsplash-react.p-0,
        .unsplash-react .p-0 { padding: 0; }

        .unsplash-react .f-1 { flex: 1; }

        .unsplash-react.d-f,
        .unsplash-react .d-f { display: flex; }

        .unsplash-react.h-f,
        .unsplash-react .h-f { 
            height: 100%;
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            padding-top: 5px;
         }

        .unsplash-react.border-radius,
        .unsplash-react .border-radius { border-radius: ${borderRadius}px; }
      `,
      }}
    />
  );
}

SearchInputIcon.propTypes = {
  isLoading: bool.isRequired,
  hasError: bool.isRequired,
  style: object,
};
function SearchInputIcon({ isLoading, hasError, style, ...rest }) {
  const searchColor = hasError ? "#D62828" : inputGray;
  const mergedStyle = { top: "0.15em", marginRight: ".5em", ...style };
  return (
    <div className="p-r" style={mergedStyle} {...rest}>
      {isLoading ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 44 44"
          stroke="#fff"
        >
          <g fill="none" fillRule="evenodd" strokeWidth="2">
            <circle cx="22" cy="22" r="14.2114">
              <animate
                attributeName="r"
                begin="0s"
                dur="1.8s"
                values="1; 20"
                calcMode="spline"
                keyTimes="0; 1"
                keySplines="0.165, 0.84, 0.44, 1"
                repeatCount="indefinite"
              />
              <animate
                attributeName="stroke-opacity"
                begin="0s"
                dur="1.8s"
                values="1; 0"
                calcMode="spline"
                keyTimes="0; 1"
                keySplines="0.3, 0.61, 0.355, 1"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="22" cy="22" r="19.7145">
              <animate
                attributeName="r"
                begin="-0.9s"
                dur="1.8s"
                values="1; 20"
                calcMode="spline"
                keyTimes="0; 1"
                keySplines="0.165, 0.84, 0.44, 1"
                repeatCount="indefinite"
              />
              <animate
                attributeName="stroke-opacity"
                begin="-0.9s"
                dur="1.8s"
                values="1; 0"
                calcMode="spline"
                keyTimes="0; 1"
                keySplines="0.3, 0.61, 0.355, 1"
                repeatCount="indefinite"
              />
            </circle>
          </g>
        </svg>
      ) : (
          <SearchIcon width="1em" height="1em" style={{ color: searchColor }} />
        )}
    </div>
  );
}

AbsolutelyCentered.propTypes = {
  width: number.isRequired,
  height: number.isRequired,
};
function AbsolutelyCentered({ width, height, ...rest }) {
  return (
    <div
      className="p-a"
      style={{
        width,
        height,
        top: "50%",
        left: "50%",
        margin: `-${height / 2}px 0 0 -${width / 2}px`,
      }}
      {...rest}
    />
  );
}

OverflowFadeLink.propTypes = {
  href: string.isRequired,
  style: object.isRequired,
  wrapperClassName: string.isRequired,
};
function OverflowFadeLink({ wrapperClassName, style = {}, ...rest }) {
  return (
    <div
      className={`p-r ${wrapperClassName}`}
      style={{
        display: "block",
        overflow: "hidden",
        maxWidth: "100%",
      }}
    >
      <a
        style={{
          ...style,
          display: "block",
          whiteSpace: "nowrap",
          maxWidth: "100%",
          textDecoration: "underline",
          fontSize: 13,
        }}
        {...rest}
      />
      <div
        className="p-a"
        style={{
          right: -2,
          top: 0,
          bottom: 0,
          width: 1,
          zIndex: 1,
        }}
      />
    </div>
  );
}

Photo.propTypes = {
  photo: shape({
    id: string.isRequired,
    urls: shape({
      small: string.isRequired,
    }).isRequired,
    user: shape({ links: shape({ html: string.isRequired }).isRequired })
      .isRequired,
  }).isRequired,
  width: number.isRequired,
  height: number.isRequired,
  index: number.isRequired,
  columns: number.isRequired,
  loadingPhoto: shape({ id: string.isRequired }),
  selectedPhoto: shape({ id: string.isRequired }),
  onPhotoClick: func.isRequired,
  highlightColor: string.isRequired,
  utmLink: func.isRequired,
};
function Photo({
  photo,
  width,
  height,
  index,
  columns,
  loadingPhoto,
  selectedPhoto,
  onPhotoClick,
  highlightColor,
  utmLink,
}) {
  const isFarLeft = index % columns === 0;
  const loadingPhotoId = loadingPhoto && loadingPhoto.id;
  const selectedPhotoId = selectedPhoto && selectedPhoto.id;
  const isSelectedAndLoaded =
    loadingPhotoId === null && selectedPhotoId === photo.id;
  const borderWidth = 3;
  const onClick = () => onPhotoClick(photo);

  return (
    <div
      style={{
        display: "inline-block",
        width,
        marginTop: 0,
        marginBottom: 12,
        marginLeft: 0,
        marginRight: 0,
        paddingTop: ".5em",
        paddingLeft: isFarLeft || ".5em",
      }}
      className="p-0"
    >
      <div
        className="p-r border-radius"
        style={{
          overflow: "hidden",
          transition: "box-shadow .3s",
          cursor: "pointer",
          width: "100%",
        }}
        onClick={onClick}
      >
        <SpinnerImg
          src={photo.urls.small}
          style={{
            display: "block",
            width: "100%",
            height,
            objectFit: "cover",
            borderWidth,
            borderStyle: "solid",
            borderColor: isSelectedAndLoaded ? highlightColor : "transparent",
            borderRadius: borderRadius + borderWidth,
            transition: "border .3s",
          }}
        />

        {loadingPhotoId === photo.id && (
          <div
            className="p-a"
            style={{
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(255,255,255,0.5)",
              animation: "unsplash-react-fadein .1s",
            }}
          >
            <AbsolutelyCentered height={40} width={40}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="44"
                height="44"
                viewBox="0 0 44 44"
                stroke="#fff"
              >
                <g fill="none" fillRule="evenodd" strokeWidth="2">
                  <circle cx="22" cy="22" r="14.2114">
                    <animate
                      attributeName="r"
                      begin="0s"
                      dur="1.8s"
                      values="1; 20"
                      calcMode="spline"
                      keyTimes="0; 1"
                      keySplines="0.165, 0.84, 0.44, 1"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="stroke-opacity"
                      begin="0s"
                      dur="1.8s"
                      values="1; 0"
                      calcMode="spline"
                      keyTimes="0; 1"
                      keySplines="0.3, 0.61, 0.355, 1"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <circle cx="22" cy="22" r="19.7145">
                    <animate
                      attributeName="r"
                      begin="-0.9s"
                      dur="1.8s"
                      values="1; 20"
                      calcMode="spline"
                      keyTimes="0; 1"
                      keySplines="0.165, 0.84, 0.44, 1"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="stroke-opacity"
                      begin="-0.9s"
                      dur="1.8s"
                      values="1; 0"
                      calcMode="spline"
                      keyTimes="0; 1"
                      keySplines="0.3, 0.61, 0.355, 1"
                      repeatCount="indefinite"
                    />
                  </circle>
                </g>
              </svg>
            </AbsolutelyCentered>
          </div>
        )}
      </div>
      <div
        className="d-f"
        style={{ padding: `.15em ${borderWidth}px 0 ${borderWidth}px` }}
      >
        <OverflowFadeLink
          href={utmLink(photo.user.links.html)}
          target="_blank"
          style={{ color: inputGray }}
          wrapperClassName="f-1"
        >
          {photo.user.name}
        </OverflowFadeLink>
      </div>
    </div>
  );
}
