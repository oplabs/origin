'use strict'

import React, { Component } from 'react'
import {
  Dimensions,
  Image,
  StyleSheet,
  TouchableOpacity,
  Text,
  TextInput,
  View
} from 'react-native'
import { connect } from 'react-redux'
import SafeAreaView from 'react-native-safe-area-view'
import { fbt } from 'fbt-runtime'
import ImagePicker from 'react-native-image-picker'

import { setProfileImage } from 'actions/Settings'
import { SettingsButton } from 'components/settings-button'
import OriginButton from 'components/origin-button'

const IMAGES_PATH = '../../../assets/images/'
const imagePickerOptions = {
  title: 'Select Photo',
  storageOptions: {
    skipBackup: true,
    path: 'images'
  }
}

class ProfileImage extends Component {
  constructor(props) {
    super(props)
    this.state = {
      profileImageSource: null,
      imagePickerError: null
    }
    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
    this.handleImageClick = this.handleImageClick.bind(this)
  }

  handleChange(field, value) {}

  handleSubmit() {}

  handleImageClick() {
    ImagePicker.showImagePicker(imagePickerOptions, response => {
      if (response.error) {
        this.setState({ imagePickerError: response.error })
        console.log(response.error)
      } else {
        const source = { uri: response.uri }
        this.setState({
          profileImageSource: source
        })
      }
    })
  }

  render() {
    const galleryPermissionDenied =
      this.state.imagePickerError === 'Photo library permissions not granted'

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {galleryPermissionDenied
            ? this.renderGalleryPermissionDenied()
            : this.renderImage()}
        </View>
        <View style={styles.buttonsContainer}>
          <OriginButton
            size="large"
            type="primary"
            style={styles.button}
            textStyle={{ fontSize: 18, fontWeight: '900' }}
            title={fbt('Continue', 'ProfileImageScreen.continueButton')}
            disabled={!this.state.profileImage}
            onPress={this.handleSubmit}
          />
        </View>
      </SafeAreaView>
    )
  }

  renderGalleryPermissionDenied() {
    return (
      <>
        <Text style={styles.title}>
          <fbt desc="ProfileImageScreen.galleryDisabledTitle">
            Gallery access denied
          </fbt>
        </Text>
        <Text style={styles.subtitle}>
          <fbt desc="ProfileImageScreen.galleryDisabledSubtitle">
            It looks like we cannot access your photo gallery. You will need to
            allow access in the settings for the Origin Marketplace App.
          </fbt>
        </Text>
        <SettingsButton />
      </>
    )
  }

  renderImage() {
    let image
    if (!this.state.profileImageSource) {
      // Placeholder image
      image = (
        <>
          <Image
            resizeMethod={'scale'}
            resizeMode={'contain'}
            source={require(IMAGES_PATH + 'partners-graphic.png')}
            style={styles.placeholderImage}
          />
          <Text style={styles.title}>
            <fbt desc="ProfileImageScreen.title">Upload a photo</fbt>
          </Text>
        </>
      )
    } else {
      image = (
        <>
          <Image
            resizeMethod={'scale'}
            resizeMode={'contain'}
            source={this.state.profileImageSource}
            style={styles.uploadedImage}
          />
          <Text style={styles.title}>
            <fbt desc="ProfileImageScreen.successTitle">Looking good</fbt>
          </Text>
        </>
      )
    }
    return (
      <TouchableOpacity
        onPress={this.handleImageClick}
        style={
          this.state.profileImageSource
            ? styles.uploadedImageContainer
            : styles.placeholderImageContainer
        }
      >
        {image}
      </TouchableOpacity>
    )
  }
}

const mapStateToProps = ({ settings, wallet }) => {
  return { settings, wallet }
}

const mapDispatchToProps = dispatch => ({
  setProfileImage: payload => dispatch(setProfileImage(payload))
})

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(ProfileImage)

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'column',
    paddingTop: 0
  },
  buttonsContainer: {
    width: '100%'
  },
  button: {
    marginBottom: 20,
    marginHorizontal: 50
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1
  },
  placeholderImageContainer: {
    backgroundColor: '#2e3f53',
    borderRadius: 50,
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    fontFamily: 'Lato',
    fontSize: 30,
    fontWeight: '600',
    marginHorizontal: 50,
    paddingTop: 20,
    paddingBottom: 20,
    textAlign: 'center'
  },
  subtitle: {
    fontFamily: 'Lato',
    fontSize: 20,
    marginHorizontal: 50,
    paddingBottom: 30,
    textAlign: 'center'
  }
})
