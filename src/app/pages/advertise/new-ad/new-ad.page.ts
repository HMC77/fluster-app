import {Component, OnInit, ViewChild} from '@angular/core';
import {LoadingController, MenuController, ModalController, NavController, Platform, Slides, ToastController} from '@ionic/angular';
import {Location} from '@angular/common';

import {Subscription} from 'rxjs';

import {HttpErrorResponse} from '@angular/common/http';

import {TranslateService} from '@ngx-translate/core';

// Pages
import {AbstractPage} from '../../abstract-page';

// Model
import {Item} from '../../../services/model/item/item';
import {User} from '../../../services/model/user/user';

// Resources and utils
import {ItemsComparator} from '../../../services/core/utils/items-utils';

// Services
import {NewItemService} from '../../../services/advertise/new-item-service';
import {AdsService} from '../../../services/advertise/ads-service';
import {GoogleAnalyticsNativeService} from '../../../services/native/analytics/google-analytics-native-service';
import {UserProfileService} from '../../../services/core/user/user-profile-service';
import {UserSessionService} from '../../../services/core/user/user-session-service';
import {NavParamsService, NewAdNavParams} from '../../../services/core/navigation/nav-params-service';

@Component({
    selector: 'app-new-ad',
    styleUrls: ['./new-ad.page.scss'],
    templateUrl: './new-ad.page.html'
})
export class NewAdPage extends AbstractPage implements OnInit {

    @ViewChild('newAdSlider') slider: Slides;

    fistChoice: boolean = false;

    private customBackActionSubscription: Subscription;

    private loading: HTMLIonLoadingElement;

    loadSlidePrice: boolean = false;
    loadSlideAttributes: boolean = false;
    loadSlideLifestyle: boolean = false;
    loadSlideAppointment: boolean = false;
    loadSlideAttendance: boolean = false;
    loadSlideLimitation: boolean = false;
    loadSlideDone: boolean = false;

    // Use to trigger the opening of the photo picker modal in case of android restart
    pendingAndroidPhoto: boolean = false;

    constructor(private navController: NavController,
                private menuController: MenuController,
                private platform: Platform,
                private loadingController: LoadingController,
                private toastController: ToastController,
                private modalController: ModalController,
                private location: Location,
                private translateService: TranslateService,
                private newItemService: NewItemService,
                private adsService: AdsService,
                private googleAnalyticsNativeService: GoogleAnalyticsNativeService,
                private userProfileService: UserProfileService,
                private userSessionService: UserSessionService,
                private navParamsService: NavParamsService) {
        super();
    }

    ngOnInit() {
        this.initNavigation();

        this.overrideHardwareBackAction();
    }

    async ionViewWillEnter() {
        // In case new user who selected directly ad in first-choice
        const newAdNavParams: NewAdNavParams = await this.navParamsService.getNewAdNavParams();
        this.fistChoice = this.isFirstChoice(newAdNavParams);
    }

    private isFirstChoice(newAdNavParams: NewAdNavParams) {
        return newAdNavParams && newAdNavParams.fistChoice === true;
    }

    async ionViewDidEnter() {
        if (this.newItemService.isDone()) {
            // We may comeback from profile
            this.enableMenu(this.menuController, false, true);
            return;
        }

        if (this.newItemService.hasPendingAndroidPhotoRecoveryURI()) {
            // There was a restart on Android because of low memory
            await this.slider.slideTo(this.newItemService.isEdit() ? 1 : 2, 0);
            this.pendingAndroidPhoto = true;
            return;
        }

        if (this.newItemService.isEdit()) {
            this.gaTrackView(this.platform, this.googleAnalyticsNativeService, this.RESOURCES.GOOGLE.ANALYTICS.TRACKER.VIEW.ADS.WIZARD.EDIT_AD);
        } else {
            this.gaTrackView(this.platform, this.googleAnalyticsNativeService, this.RESOURCES.GOOGLE.ANALYTICS.TRACKER.VIEW.ADS.WIZARD.NEW_AD);
        }
    }

    ionViewDidLeave() {
        if (this.customBackActionSubscription) {
            this.customBackActionSubscription.unsubscribe();
        }
    }

    isEditMode(): boolean {
        return this.newItemService.isEdit();
    }

    private overrideHardwareBackAction() {
        this.platform.ready().then(() => {
            this.customBackActionSubscription = this.platform.backButton.subscribe(() => {
                this.modalController.getTop().then((element: HTMLIonModalElement) => {
                    // A modal might be open, in such a case we are closing it with the back button we don't need to navigate
                    if (!element) {
                        const activeView: string = this.location.path();

                        if (activeView != null && activeView.indexOf('/new-ad') > -1) {
                            this.backToPreviousSlide();
                        } else {
                            this.location.back();
                        }
                    }
                });
            });
        });
    }

    private initNavigation() {
        // Disable menu
        this.enableMenu(this.menuController, false, false);
    }

    async backToPreviousSlide() {
        const index: number = await this.slider.getActiveIndex();

        if (index > 0 && !this.newItemService.isDone()) {
            await this.slider.slidePrev();
        } else {
            const newAdNavParams: NewAdNavParams = await this.navParamsService.getNewAdNavParams();
            if (this.isFirstChoice(newAdNavParams)) {
                newAdNavParams.fistChoice = false;
            }

            if (this.fistChoice) {
                this.navController.navigateRoot('/ads-next-appointments').then(() => {
                    // Do nothing
                });
            } else {
                this.location.back();
            }
        }
    }

    isItemShare() {
        const item: Item = this.newItemService.getNewItem();
        return ItemsComparator.isItemShare(item);
    }

    isItemFlat() {
        const item: Item = this.newItemService.getNewItem();
        return ItemsComparator.isItemFlat(item);
    }

    async publish() {
        this.loading = await this.loadingController.create({});

        if (this.newItemService.isEdit()) {
            this.gaTrackEvent(this.platform, this.googleAnalyticsNativeService, this.RESOURCES.GOOGLE.ANALYTICS.TRACKER.EVENT.CATEGORY.ADS.WIZARD, this.RESOURCES.GOOGLE.ANALYTICS.TRACKER.EVENT.ACTION.ADS.WIZARD.PUBLISH.UPDATE_CALLED);
        } else {
            this.gaTrackEvent(this.platform, this.googleAnalyticsNativeService, this.RESOURCES.GOOGLE.ANALYTICS.TRACKER.EVENT.CATEGORY.ADS.WIZARD, this.RESOURCES.GOOGLE.ANALYTICS.TRACKER.EVENT.ACTION.ADS.WIZARD.PUBLISH.PUBLISH_CALLED);
        }

        this.loading.present().then(() => {
            const user: User = this.userSessionService.getUser();

            this.userProfileService.saveIfModified(user).then((updatedUser: User) => {
                this.newItemService.saveNewItem().then(() => {
                    // Save new item in actual session
                    this.adsService.setSelectedItem(this.newItemService.getNewItem());

                    this.navigateToDone();
                }, (errorResponse: HttpErrorResponse) => {
                    this.displayPublishError(errorResponse);
                });
            }, (response: HttpErrorResponse) => {
                this.displayPublishError(response);
            });
        });
    }

    private displayPublishError(err: HttpErrorResponse) {
        this.loading.dismiss().then(() => {
            this.errorMsg(this.toastController, this.translateService, 'ERRORS.WIZARD.NOT_ADDED');

            this.gaTrackError();
        });
    }

    private gaTrackError() {
        if (this.newItemService.isEdit()) {
            this.gaTrackEvent(this.platform, this.googleAnalyticsNativeService, this.RESOURCES.GOOGLE.ANALYTICS.TRACKER.EVENT.CATEGORY.ADS.WIZARD, this.RESOURCES.GOOGLE.ANALYTICS.TRACKER.EVENT.ACTION.ADS.WIZARD.PUBLISH.UPDATE_ERROR);
        } else {
            this.gaTrackEvent(this.platform, this.googleAnalyticsNativeService, this.RESOURCES.GOOGLE.ANALYTICS.TRACKER.EVENT.CATEGORY.ADS.WIZARD, this.RESOURCES.GOOGLE.ANALYTICS.TRACKER.EVENT.ACTION.ADS.WIZARD.PUBLISH.PUBLISH_ERROR);
        }
    }

    private navigateToDone() {
        if (this.ENV_CORDOVA) {
            // On big screen the slide not gonna be displayed correctly
            this.enableMenu(this.menuController, false, true);
        }

        this.updateSlider();

        this.loading.dismiss().then(() => {
            this.slider.slideNext();

            if (this.newItemService.isEdit()) {
                this.gaTrackEvent(this.platform, this.googleAnalyticsNativeService, this.RESOURCES.GOOGLE.ANALYTICS.TRACKER.EVENT.CATEGORY.ADS.WIZARD, this.RESOURCES.GOOGLE.ANALYTICS.TRACKER.EVENT.ACTION.ADS.WIZARD.PUBLISH.UPDATE_DONE);
            } else {
                this.gaTrackEvent(this.platform, this.googleAnalyticsNativeService, this.RESOURCES.GOOGLE.ANALYTICS.TRACKER.EVENT.CATEGORY.ADS.WIZARD, this.RESOURCES.GOOGLE.ANALYTICS.TRACKER.EVENT.ACTION.ADS.WIZARD.PUBLISH.PUBLISH_DONE);
            }
        });
    }

    navigateToAdDetail() {
        this.navController.navigateRoot('/ads-details', true);
    }

    // HACK: Fck it, Load incrementaly these steps for devices with small memory which could not handle a important load on load of the slides

    loadNextSlidePrice() {
        this.loadSlidePrice = true;
        this.updateSlider();
    }

    loadNextSlideAttributes() {
        this.loadSlideAttributes = true;
        this.updateSlider();
    }

    loadNextSlideLifestyle() {
        this.loadSlideLifestyle = true;
        this.updateSlider();
    }

    loadNextSlidesFromPrice() {
        if (this.isItemFlat()) {
            this.loadSlideAppointment = true;
        } else {
            this.loadSlideLifestyle = true;
        }

        this.updateSlider();
    }

    loadNextSlidesFromAttributes() {
        if (this.isItemFlat()) {
            this.loadSlideAttendance = true;
        } else {
            this.loadSlideAppointment = true;
        }

        this.updateSlider();
    }

    loadNextSlideLimitation() {
        this.loadSlideLimitation = true;
        this.updateSlider();
    }

    loadNextSlideFromAppointments() {
        if (this.isItemFlat()) {
            this.loadSlideLimitation = true;
        } else {
            this.loadSlideDone = true;
        }

        this.updateSlider();
    }

    loadNextSlideDone() {
        this.loadSlideDone = true;
        this.updateSlider();
    }

    isDone(): boolean {
        return this.newItemService.isDone();
    }

    private async updateSlider() {
        // Slider need to be updated when slide are manually added or removed
        await this.slider.update();
    }

}
